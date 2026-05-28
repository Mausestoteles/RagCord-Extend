// ──────────────────────────────────────────────
// Paths – zentrale Stelle für die RagCord-Datenverzeichnisse
// ──────────────────────────────────────────────
// Spiegelt die DATA_DIR-Konvention aus src/main/patcher.ts:
//   process.env.DATA_DIR = join(app.getPath("userData"), "..", "RagCord");
// d.h. unter %AppData% (Roaming) entsteht ein "RagCord"-Ordner, der bei
// Deinstallation optional erhalten bleibt (Settings/Themes/Session).

using System.IO;

namespace RagCordInstaller.Installation;

internal static class Paths
{
    /// <summary>%AppData%\RagCord – die persistente RagCord-Heimat.</summary>
    public static string RagCordRoot { get; } = Path.Combine(
        System.Environment.GetFolderPath(System.Environment.SpecialFolder.ApplicationData),
        "RagCord");

    /// <summary>Hier liegen die ausgepackten Build-Assets (patcher.js etc.).</summary>
    public static string DistDir => Path.Combine(RagCordRoot, "dist");

    /// <summary>Manifest mit Version + Inject-Targets der laufenden Installation.</summary>
    public static string ManifestFile => Path.Combine(RagCordRoot, "install-manifest.json");

    /// <summary>Roh-Pfad zu patcher.js, der von der Inject-Stub gerequired wird.</summary>
    public static string PatcherJs => Path.Combine(DistDir, "patcher.js");
}
