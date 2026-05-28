// ──────────────────────────────────────────────
// DiscordProcess – findet und beendet laufende Discord-Instanzen
// ──────────────────────────────────────────────
// Discord öffnet `resources/app.asar` mit Read-Share, aber sobald wir es
// umbenennen wollen schlägt das auf laufenden Instanzen mit FileNotFoundException
// /ERROR_SHARING_VIOLATION fehl. Saubere Lösung: vor dem Patchen einmal alle
// passenden Prozesse beenden. Wir warten kurz auf graceful exit, danach Kill.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;

namespace RagCordInstaller.Discord;

internal static class DiscordProcess
{
    /// <summary>Wartet bis zu so lange auf graceful exit, bevor Kill().</summary>
    private static readonly TimeSpan GracefulWait = TimeSpan.FromMilliseconds(1500);

    /// <summary>
    /// Beendet alle Discord-Prozesse (Stable/PTB/Canary + Helper). Idempotent
    /// und still — Fehler beim einzelnen Prozess sollen den Patch-Lauf nicht
    /// abbrechen. Liefert die Anzahl effektiv beendeter Prozesse zurück.
    /// </summary>
    public static int KillAll()
    {
        // Process-Name (ohne .exe) matched: Discord, DiscordPTB, DiscordCanary.
        // Helper-Prozesse heißen genauso (Electron startet sich rekursiv) —
        // GetProcessesByName fängt also alles in einem Rutsch.
        var targets = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Discord", "DiscordPTB", "DiscordCanary",
        };

        var killed = 0;
        foreach (var p in Process.GetProcesses())
        {
            try
            {
                if (!targets.Contains(p.ProcessName)) continue;
            }
            catch
            {
                // ProcessName kann nach Exit werfen — überspringen.
                continue;
            }

            try
            {
                // Ein höflicher CloseMainWindow scheitert, weil Discord
                // System-Tray-resident bleibt. Direkt Kill ist der einzige
                // verlässliche Weg.
                p.Kill(entireProcessTree: true);
                if (p.WaitForExit((int)GracefulWait.TotalMilliseconds))
                {
                    killed++;
                }
            }
            catch
            {
                // Berechtigung verweigert / schon weg — egal, weitermachen.
            }
        }

        // Kurze Atempause, damit das OS die File-Handles freigibt, bevor
        // wir resources/app.asar umbenennen.
        if (killed > 0) Thread.Sleep(300);

        return killed;
    }

    /// <summary>
    /// Startet einen Branch nach erfolgreicher Installation wieder — der
    /// Updater.exe-Pfad sitzt im Branch-Root (eine Ebene über app-X.Y.Z).
    /// </summary>
    public static bool TryStart(DiscordBranch branch)
    {
        try
        {
            var updater = Path.Combine(branch.RootPath, "Update.exe");
            if (!File.Exists(updater)) return false;

            // --processStart ist die Discord-Updater-CLI, die auch der
            // Start-Menu-Eintrag verwendet. Damit landet Discord brav im
            // Versionsordner und der Tray-Process wird sauber gehandhabt.
            var args = $"--processStart {branch.ProcessName}.exe";
            Process.Start(new ProcessStartInfo
            {
                FileName = updater,
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            return true;
        }
        catch
        {
            return false;
        }
    }
}
