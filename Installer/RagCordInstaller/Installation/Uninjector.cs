// ──────────────────────────────────────────────
// Uninjector – macht Inject rückgängig, optional inkl. RagCord-Daten
// ──────────────────────────────────────────────
// Pro Branch:
//   1. resources/app.asar (Ordner) löschen
//   2. resources/_app.asar → resources/app.asar (rename zurück)
//
// Falls _app.asar fehlt (z.B. nach Discord-Reparatur-Install hat Discord
// das Original wiederhergestellt UND wir liegen noch mit unserem
// app.asar/-Ordner daneben), entfernen wir nur unseren Ordner. Discord
// startet dann normal mit dem geheilten app.asar.
//
// `keepUserData = true`  → behält %AppData%/RagCord (Login-Session, Themes,
//                          QuickCSS, Plugin-Einstellungen) – Default.
// `keepUserData = false` → wirft den kompletten RagCord-Ordner weg.

using System;
using System.IO;

namespace RagCordInstaller.Installation;

internal sealed class UninjectorException : Exception
{
    public UninjectorException(string message) : base(message) { }
    public UninjectorException(string message, Exception inner) : base(message, inner) { }
}

internal static class Uninjector
{
    public static void Uninject(Discord.DiscordInstall install)
    {
        if (install.ResourcesDir is null) return;

        var resources = install.ResourcesDir;
        var appAsar = Path.Combine(resources, "app.asar");
        var underscoreAsar = Path.Combine(resources, "_app.asar");

        // Unseren Stub-Ordner wegräumen.
        if (Directory.Exists(appAsar))
        {
            try
            {
                Directory.Delete(appAsar, recursive: true);
            }
            catch (IOException e)
            {
                throw new UninjectorException(
                    $"{install.Branch.DisplayName}: app.asar-Stub konnte nicht entfernt werden " +
                    "(Discord noch geöffnet?).", e);
            }
        }

        // Original zurück an seinen Platz, sofern wir es behalten haben.
        if (File.Exists(underscoreAsar))
        {
            if (File.Exists(appAsar))
            {
                // Sollte nach dem Delete oben nicht passieren — wenn doch,
                // wäre das jetzt ein File über einem File, was File.Move
                // sowieso blockt. Defensiv: löschen.
                File.Delete(appAsar);
            }
            try
            {
                File.Move(underscoreAsar, appAsar);
            }
            catch (IOException e)
            {
                throw new UninjectorException(
                    $"{install.Branch.DisplayName}: _app.asar konnte nicht zurück verschoben " +
                    "werden.", e);
            }
        }

        ManifestStore.ForgetBranch(install.Branch);
    }

    /// <summary>Löscht %AppData%/RagCord komplett (inkl. Session, Themes, QuickCSS).</summary>
    public static void PurgeUserData()
    {
        if (!Directory.Exists(Paths.RagCordRoot)) return;
        try
        {
            Directory.Delete(Paths.RagCordRoot, recursive: true);
        }
        catch (IOException)
        {
            // Beste-Mühe — wenn z.B. ein Texteditor noch eine settings.json
            // offen hat, soll der Rest der Deinstallation trotzdem durchgehen.
        }
    }
}
