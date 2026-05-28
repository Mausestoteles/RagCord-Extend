// ──────────────────────────────────────────────
// ManifestStore – persistiert, welche Branches gepatcht wurden
// ──────────────────────────────────────────────
// %AppData%/RagCord/install-manifest.json hält eine simple Liste der zuletzt
// injizierten Branches plus Zeitstempel. Der Uninjector iteriert die Liste,
// um in jedem Branch sauber zurückzudrehen — auch wenn der entsprechende
// Branch nach dem Inject inzwischen entfernt wurde.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace RagCordInstaller.Installation;

internal sealed class InstallManifest
{
    public string Version { get; set; } = "1";
    public DateTimeOffset LastInjectAt { get; set; }
    public List<string> Branches { get; set; } = new();
}

internal static class ManifestStore
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static InstallManifest Load()
    {
        try
        {
            if (!File.Exists(Paths.ManifestFile)) return new InstallManifest();
            var raw = File.ReadAllText(Paths.ManifestFile);
            return JsonSerializer.Deserialize<InstallManifest>(raw) ?? new InstallManifest();
        }
        catch
        {
            // Korruptes Manifest? Lieber neu anfangen als crashen — der
            // Uninstall-Pfad geht zur Not auch ohne, indem er pro Branch
            // den DiscordDetector befragt.
            return new InstallManifest();
        }
    }

    public static void Save(InstallManifest manifest)
    {
        Directory.CreateDirectory(Paths.RagCordRoot);
        var tmp = Paths.ManifestFile + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(manifest, Json));
        if (File.Exists(Paths.ManifestFile)) File.Delete(Paths.ManifestFile);
        File.Move(tmp, Paths.ManifestFile);
    }

    public static void RecordBranch(Discord.DiscordBranch branch)
    {
        var manifest = Load();
        if (!manifest.Branches.Contains(branch.FolderName, StringComparer.OrdinalIgnoreCase))
        {
            manifest.Branches.Add(branch.FolderName);
        }
        manifest.LastInjectAt = DateTimeOffset.UtcNow;
        Save(manifest);
    }

    public static void ForgetBranch(Discord.DiscordBranch branch)
    {
        var manifest = Load();
        manifest.Branches.RemoveAll(b =>
            string.Equals(b, branch.FolderName, StringComparison.OrdinalIgnoreCase));
        Save(manifest);
    }
}
