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
        var underscoreIsFile = File.Exists(underscoreAsar);

        // Erst-Injektion: Datei umbenennen, dann mkdir + Stub schreiben.
        if (asarIsFile && !underscoreIsFile)
        {
            try
            {
                File.Move(appAsar, underscoreAsar);
            }
            catch (IOException e)
            {
                throw new InjectorException(
                    $"{install.Branch.DisplayName}: app.asar konnte nicht umbenannt werden " +
                    "(läuft Discord noch?). Bitte schließe Discord und versuche es erneut.",
                    e);
            }
            asarIsDir = false;
            underscoreIsFile = true;
        }

        // Reparieren / Re-Inject: Ordner & Original sind beide schon da.
        // Wir schreiben den Stub einfach neu (Inhalt referenziert eventuell
        // einen aktualisierten patcher.js-Pfad).
        if (!underscoreIsFile)
        {
            throw new InjectorException(
                $"{install.Branch.DisplayName}: _app.asar nicht gefunden, app.asar aber als " +
                "Verzeichnis vorhanden. Bitte zuerst deinstallieren oder Discord neu installieren.");
        }

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
