// ──────────────────────────────────────────────
// DiscordDetector – findet installierte Branches & deren aktive Versionen
// ──────────────────────────────────────────────
// Antwortet zwei Fragen pro Branch:
//   1. Existiert die Installation überhaupt?  (Branch-Root + app-X.Y.Z + resources)
//   2. Ist sie aktuell injiziert?               (resources/_app.asar vorhanden +
//                                                resources/app.asar ist ein Verzeichnis)
//
// Diese Trennung ist wichtig, weil das Wizard zwei Wege gehen muss:
//   - Branch installiert + nicht injiziert  → "Installieren"
//   - Branch installiert + bereits injiziert → "Reparieren" (Files neu schreiben)
//                                              oder "Deinstallieren"
//   - Branch nicht installiert               → ausgrauen

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace RagCordInstaller.Discord;

internal enum InstallStatus
{
    NotInstalled,
    Installed,
    AlreadyInjected,
    Broken,
}

internal sealed record DiscordInstall(
    DiscordBranch Branch,
    string? LatestVersionDir,
    string? ResourcesDir,
    InstallStatus Status,
    string? Detail);

internal static class DiscordDetector
{
    public static List<DiscordInstall> ScanAll()
    {
        var results = new List<DiscordInstall>(DiscordBranch.All.Length);
        foreach (var branch in DiscordBranch.All)
        {
            results.Add(ScanOne(branch));
        }
        return results;
    }

    public static DiscordInstall ScanOne(DiscordBranch branch)
    {
        if (!Directory.Exists(branch.RootPath))
        {
            return new DiscordInstall(branch, null, null, InstallStatus.NotInstalled, null);
        }

        var versionDir = FindLatestVersionDir(branch.RootPath);
        if (versionDir is null)
        {
            // Branch-Ordner existiert, aber kein `app-X.Y.Z`. Wahrscheinlich
            // mid-update oder kaputte Installation.
            return new DiscordInstall(branch, null, null, InstallStatus.Broken,
                "Kein app-X.Y.Z-Unterordner gefunden.");
        }

        var resources = Path.Combine(versionDir, "resources");
        if (!Directory.Exists(resources))
        {
            return new DiscordInstall(branch, versionDir, null, InstallStatus.Broken,
                "resources/-Ordner fehlt.");
        }

        var asarFile = Path.Combine(resources, "app.asar");
        var asarFolder = asarFile; // gleicher Pfad — Datei vs. Verzeichnis ist die Unterscheidung
        var underscoreAsar = Path.Combine(resources, "_app.asar");

        // Konvention vom patchWin32Updater.ts:
        //   nicht-injiziert → app.asar ist Datei, _app.asar fehlt
        //   injiziert       → app.asar ist Verzeichnis MIT package.json+index.js,
        //                     _app.asar ist Datei (das Original)
        var asarIsDir = Directory.Exists(asarFolder);
        var underscoreExists = File.Exists(underscoreAsar);
        var asarFileExists = File.Exists(asarFile);

        if (asarIsDir && underscoreExists)
        {
            return new DiscordInstall(branch, versionDir, resources,
                InstallStatus.AlreadyInjected, null);
        }
        if (asarFileExists && !underscoreExists)
        {
            return new DiscordInstall(branch, versionDir, resources,
                InstallStatus.Installed, null);
        }
        if (asarFileExists && underscoreExists)
        {
            // Halb-deinstallierter Vencord-Rest o.ä.: das original-Bundle
            // wurde nach _app.asar gesichert, aber app.asar steht wieder als
            // separate Datei daneben. Discord boot-bar, aber inkonsistent.
            // Der Installer räumt das beim nächsten Inject auf.
            return new DiscordInstall(branch, versionDir, resources, InstallStatus.Installed,
                "Vencord-/Mod-Reste vorhanden — Installation räumt sie auf.");
        }
        // _app.asar da, app.asar weder Datei noch Verzeichnis — Discord
        // würde gar nicht starten. Manuelle Reparatur nötig.
        return new DiscordInstall(branch, versionDir, resources, InstallStatus.Broken,
            "Discord-Bundle fehlt. Bitte Discord neu installieren.");
    }

    /// <summary>
    /// Findet unter dem Branch-Root den höchsten `app-X.Y.Z`-Ordner.
    /// Discord legt bei Updates ein neues Versionsverzeichnis daneben,
    /// löscht das alte aber nicht sofort — also Sortierung statt
    /// "letztes Mtime gewinnt".
    /// </summary>
    private static string? FindLatestVersionDir(string branchRoot)
    {
        var versionDirs = new List<(string Path, int[] Parts)>();
        foreach (var dir in Directory.EnumerateDirectories(branchRoot, "app-*"))
        {
            var name = Path.GetFileName(dir);
            if (!name.StartsWith("app-", StringComparison.Ordinal)) continue;
            if (TryParseVersion(name[4..], out var parts))
            {
                versionDirs.Add((dir, parts));
            }
        }

        if (versionDirs.Count == 0) return null;

        return versionDirs
            .OrderByDescending(v => v.Parts, new IntArrayComparer())
            .First()
            .Path;
    }

    private static bool TryParseVersion(string s, out int[] parts)
    {
        var raw = s.Split('.');
        parts = new int[raw.Length];
        for (var i = 0; i < raw.Length; i++)
        {
            if (!int.TryParse(raw[i], out parts[i]))
            {
                parts = Array.Empty<int>();
                return false;
            }
        }
        return parts.Length > 0;
    }

    private sealed class IntArrayComparer : IComparer<int[]>
    {
        public int Compare(int[]? a, int[]? b)
        {
            if (a is null && b is null) return 0;
            if (a is null) return -1;
            if (b is null) return 1;
            var n = Math.Min(a.Length, b.Length);
            for (var i = 0; i < n; i++)
            {
                if (a[i] != b[i]) return a[i].CompareTo(b[i]);
            }
            return a.Length.CompareTo(b.Length);
        }
    }
}
