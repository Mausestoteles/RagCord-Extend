// ──────────────────────────────────────────────
// Eine Discord-Installation (Stable / PTB / Canary)
// ──────────────────────────────────────────────
// Ein Branch ist „installiert", wenn der Branch-Ordner unter %LocalAppData%
// existiert und mindestens ein `app-X.Y.Z`-Unterordner mit `resources/app.asar`
// drin liegt. Wir patchen immer den höchsten gefundenen Versionsordner — der
// Win32-Updater-Hook (patchWin32Updater.ts) zieht das danach selbstständig nach,
// falls Discord später ein neues `app-X.Y.Z` daneben legt.

namespace RagCordInstaller.Discord;

internal enum DiscordBranchKind
{
    Stable,
    PTB,
    Canary,
}

internal sealed record DiscordBranch(
    DiscordBranchKind Kind,
    string DisplayName,
    string FolderName,
    string ProcessName)
{
    /// <summary>Voller Pfad zum Branch-Ordner, z.B. C:\Users\X\AppData\Local\Discord.</summary>
    public string RootPath => System.IO.Path.Combine(
        System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData),
        FolderName);

    public static readonly DiscordBranch[] All =
    [
        new(DiscordBranchKind.Stable, "Discord (Stable)", "Discord",       "Discord"),
        new(DiscordBranchKind.PTB,    "Discord PTB",      "DiscordPTB",    "DiscordPTB"),
        new(DiscordBranchKind.Canary, "Discord Canary",   "DiscordCanary", "DiscordCanary"),
    ];
}
