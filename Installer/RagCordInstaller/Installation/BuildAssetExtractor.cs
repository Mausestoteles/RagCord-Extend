// ──────────────────────────────────────────────
// BuildAssetExtractor – packt embedded BuildAssets/* nach %AppData%/RagCord/dist
// ──────────────────────────────────────────────
// Die `.csproj` embeddet jede Datei unter BuildAssets/ als Resource mit
// LogicalName "BuildAssets/<relativer Pfad>". Beim Install holen wir die
// Ressourcennamen aus dem aktuellen Assembly, schreiben jede Datei atomar
// (write to .tmp, rename) in `%AppData%/RagCord/dist`.
//
// Atomarer Write ist wichtig: bricht der Install ab, bleibt die alte
// Vorgängerdatei intakt — kein halb-geschriebener `patcher.js`, der Discord
// beim nächsten Start in einen ReferenceError treiben würde.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace RagCordInstaller.Installation;

internal static class BuildAssetExtractor
{
    private const string ResourcePrefix = "BuildAssets/";

    /// <summary>Liefert die relativen Pfade aller eingebetteten BuildAssets.</summary>
    public static IReadOnlyList<string> ListAssets()
    {
        var asm = Assembly.GetExecutingAssembly();
        return asm.GetManifestResourceNames()
            .Where(n => n.StartsWith(ResourcePrefix, StringComparison.Ordinal))
            .Select(n => n[ResourcePrefix.Length..])
            .Where(n => n.Length > 0)
            .ToList();
    }

    /// <summary>
    /// Packt sämtliche eingebetteten Build-Assets unter <see cref="Paths.DistDir"/> aus.
    /// Bestehende Dateien werden überschrieben.
    /// </summary>
    public static void ExtractAll()
    {
        var asm = Assembly.GetExecutingAssembly();
        Directory.CreateDirectory(Paths.DistDir);

        foreach (var resourceName in asm.GetManifestResourceNames())
        {
            if (!resourceName.StartsWith(ResourcePrefix, StringComparison.Ordinal)) continue;

            var relPath = resourceName[ResourcePrefix.Length..];
            if (string.IsNullOrEmpty(relPath)) continue;

            // Resource-LogicalName-Trennzeichen ist `/` (Build-Konvention),
            // wir wandeln in plattform-natives Trennzeichen um. Defensiv
            // gegen Traversal-Sequenzen: jede Komponente darf nicht ".." sein.
            var parts = relPath.Split('/');
            if (parts.Any(p => p == ".." || string.IsNullOrEmpty(p)))
            {
                continue;
            }

            var targetPath = Path.Combine(new[] { Paths.DistDir }.Concat(parts).ToArray());
            var targetDir = Path.GetDirectoryName(targetPath);
            if (!string.IsNullOrEmpty(targetDir)) Directory.CreateDirectory(targetDir);

            using var src = asm.GetManifestResourceStream(resourceName)
                            ?? throw new InvalidOperationException(
                                $"Embedded resource '{resourceName}' konnte nicht geöffnet werden.");

            var tmpPath = targetPath + ".tmp";
            using (var dst = File.Create(tmpPath))
            {
                src.CopyTo(dst);
            }

            if (File.Exists(targetPath)) File.Delete(targetPath);
            File.Move(tmpPath, targetPath);
        }
    }

    /// <summary>Sanity-Check: ist überhaupt ein <c>patcher.js</c> eingebettet?</summary>
    public static bool HasPatcherJs()
    {
        return ListAssets().Any(p =>
            p.Equals("patcher.js", StringComparison.OrdinalIgnoreCase));
    }
}
