// ──────────────────────────────────────────────
// WizardContext – State, der zwischen den Seiten weitergereicht wird
// ──────────────────────────────────────────────

using System.Collections.Generic;
using RagCordInstaller.Discord;
using RagCordInstaller.UI.Pages;

namespace RagCordInstaller.UI;

internal sealed class WizardContext
{
    /// <summary>Branches, die auf der BranchesPage selektiert wurden.</summary>
    public List<DiscordInstall> SelectedInstalls { get; set; } = new();

    /// <summary>Was getan werden soll. Default Install — auf der ActionPage gesetzt.</summary>
    public WizardAction Action { get; set; } = WizardAction.Install;

    /// <summary>Bei Uninstall: %AppData%\RagCord mitlöschen?</summary>
    public bool PurgeUserData { get; set; }

    /// <summary>Branches, die im ProgressPage-Lauf tatsächlich angefasst wurden.</summary>
    public List<DiscordInstall> Outcomes { get; } = new();

    /// <summary>Fehlermeldungen aus dem ProgressPage-Lauf.</summary>
    public List<string> Errors { get; } = new();
}
