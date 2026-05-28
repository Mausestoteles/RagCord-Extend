// ──────────────────────────────────────────────
// Injector – das eigentliche Patching von Discord
// ──────────────────────────────────────────────
// Pro ausgewähltem Branch:
//   1. resources/app.asar → resources/_app.asar  (rename Datei → Datei)
//   2. mkdir resources/app.asar/                  (gleicher Name, jetzt Ordner)
//   3. resources/app.asar/package.json            { name: "discord", main: "index.js" }
//   4. resources/app.asar/index.js                require("<absoluter Pfad zu patcher.js>");
//
// Das deckungsgleich mit src/main/patchWin32Updater.ts, damit Discord-eigene
// Host-Updates konsistent repatched werden, ohne dass der Installer nochmal
// laufen muss.
//
// Wenn bereits injiziert: wir treffen "Reparieren"-Annahme — Stub einfach
// neu schreiben. Falls _app.asar fehlt, aber app.asar/ als Ordner existiert,
// machen wir das NICHT — das wäre ein Anti-Muster und würde Discord
// permanent broken hinterlassen.

using System;
using System.IO;
using System.Text.Json;

namespace RagCordInstaller.Installation;

internal sealed class InjectorException : Exception
{
    public InjectorException(string message) : base(message) { }
    public InjectorException(string message, Exception inner) : base(message, inner) { }
}

internal static class Injector
{
    /// <summary>
    /// Injiziert den Stub in den übergebenen Branch und kopiert die
    /// Build-Assets nach %AppData%/RagCord/dist. Wirft <see cref="InjectorException"/>
    /// bei vorhersehbaren Fehlerursachen (fehlende Quelle, Sharing-Violation).
    /// </summary>
    public static void Inject(Discord.DiscordInstall install)
    {
        if (install.ResourcesDir is null)
        {
            throw new InjectorException(
                $"{install.Branch.DisplayName}: resources/-Verzeichnis nicht gefunden.");
        }

        // 1) Build-Assets entpacken (idempotent, überschreibt). Damit liegt
        // patcher.js garantiert dort, wo der Stub gleich hin-requirt.
        if (!BuildAssetExtractor.HasPatcherJs())
        {
            throw new InjectorException(
                "Im Installer ist kein patcher.js eingebettet. " +
                "Wurde der Installer ohne vorherigen `pnpm build` gebaut?");
        }
        BuildAssetExtractor.ExtractAll();

        var resources = install.ResourcesDir;
        var appAsar = Path.Combine(resources, "app.asar");
        var underscoreAsar = Path.Combine(resources, "_app.asar");

        var asarIsDir = Directory.Exists(appAsar);
        var asarIsFile = File.Exists(appAsar) && !asarIsDir;
        var underscoreExists = File.Exists(underscoreAsar);

        // Vier mögliche Ausgangszustände in resources/. Wir bringen alle
        // in die Form "_app.asar = Original, app.asar = Stub-Verzeichnis":
        //
        //   A) app.asar=Datei, _app.asar=fehlt
        //      → frische Discord-Installation. app.asar → _app.asar umbenennen.
        //   B) app.asar=Verzeichnis, _app.asar=Datei
        //      → schon injiziert (Vencord, alter RagCord, etc.). Stub wird gleich
        //        überschrieben — Verzeichnis kann bleiben.
        //   C) app.asar=Datei, _app.asar=Datei
        //      → halb-deinstalliert / verwaister Vencord-Cleanup-Rest. Die
        //        app.asar-Datei ist hier Müll (entweder Vencord-Stub oder ein
        //        Discord-Update-Artefakt); _app.asar ist das echte Original.
        //        Wir werfen die verwaiste app.asar weg.
        //   D) app.asar=Verzeichnis, _app.asar=fehlt
        //      → ein anderer Mod hat das Original verloren. Hier weiterzumachen
        //        wäre fahrlässig, weil Discord ohne _app.asar nicht mehr bootet.

        if (asarIsFile && !underscoreExists)
        {
            // A
            try { File.Move(appAsar, underscoreAsar); }
            catch (IOException e)
            {
                throw new InjectorException(
                    $"{install.Branch.DisplayName}: app.asar konnte nicht umbenannt werden " +
                    "(läuft Discord noch?). Bitte schließe Discord und versuche es erneut.",
                    e);
            }
        }
        else if (asarIsFile && underscoreExists)
        {
            // C – verwaiste app.asar-Datei wegräumen
            try { File.Delete(appAsar); }
            catch (IOException e)
            {
                throw new InjectorException(
                    $"{install.Branch.DisplayName}: verwaiste app.asar-Datei konnte nicht " +
                    "entfernt werden (Discord noch offen oder Datei gesperrt?).",
                    e);
            }
        }
        else if (asarIsDir && !underscoreExists)
        {
            // D
            throw new InjectorException(
                $"{install.Branch.DisplayName}: app.asar liegt als Verzeichnis vor, aber " +
                "_app.asar fehlt — das Original-Bundle ist nicht auffindbar. " +
                "Bitte Discord komplett deinstallieren (inkl. %LocalAppData%\\Discord) und " +
                "neu installieren, dann das Setup nochmal starten.");
        }
        else if (!asarIsDir && !asarIsFile && !underscoreExists)
        {
            throw new InjectorException(
                $"{install.Branch.DisplayName}: weder app.asar noch _app.asar vorhanden. " +
                "Discord ist defekt — bitte neu installieren.");
        }
        // Sonst B: Verzeichnis + Original beide da, einfach weiter zum Stub-Schreiben.

        Directory.CreateDirectory(appAsar);
        WriteStubFiles(appAsar);

        // Manifest aktualisieren, damit der Uninjector weiß, was er aufräumen muss.
        ManifestStore.RecordBranch(install.Branch);
    }

    private static void WriteStubFiles(string appAsarDir)
    {
        // package.json – Inhalt identisch zu patchWin32Updater.ts:60-63
        var pkg = JsonSerializer.Serialize(new
        {
            name = "discord",
            main = "index.js",
        });
        WriteAtomic(Path.Combine(appAsarDir, "package.json"), pkg);

        // index.js – lädt %AppData%/RagCord/dist/patcher.js. Der Pfad wird
        // als JSON-String escaped, damit Backslashes auf Windows korrekt
        // durchkommen ("C:\\Users\\…\\patcher.js"). Identisches Muster wie
        // patchWin32Updater.ts:64.
        var patcherPath = Paths.PatcherJs.Replace("\\", "\\\\");
        var indexJs = $"require(\"{patcherPath}\");\n";
        WriteAtomic(Path.Combine(appAsarDir, "index.js"), indexJs);
    }

    private static void WriteAtomic(string path, string content)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, content);
        if (File.Exists(path)) File.Delete(path);
        File.Move(tmp, path);
    }
}
