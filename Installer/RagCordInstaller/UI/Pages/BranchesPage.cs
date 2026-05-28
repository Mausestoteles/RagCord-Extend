// ──────────────────────────────────────────────
// BranchesPage – Schritt 2: Discord-Branch auswählen
// ──────────────────────────────────────────────
// Listet Stable/PTB/Canary mit Status-Badge. Mindestens ein Branch muss
// gewählt sein, sonst bleibt „Weiter" gesperrt.
// Die ausgewählten Installs werden über WizardContext an die nächste Seite
// weitergereicht.

using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using RagCordInstaller.Discord;

namespace RagCordInstaller.UI.Pages;

internal sealed class BranchesPage : WizardPage
{
    private readonly WizardContext _ctx;
    private readonly List<BranchRow> _rows = new();

    public override string Title => "Discord-Branches";
    public override string Subtitle =>
        "Waehle die Discord-Branches, auf denen RagCord Extend installiert werden soll.";

    public override bool CanGoNext => _rows.Any(r => r.IsChecked);

    public BranchesPage(WizardContext ctx)
    {
        _ctx = ctx;
        Build();
    }

    private void Build()
    {
        var yStart = RenderHeader();

        var listHost = new Panel
        {
            Location = new Point(36, yStart + 8),
            Size = new Size(Width - 72, 220),
            BackColor = Palette.Bg,
        };
        Controls.Add(listHost);

        var scans = DiscordDetector.ScanAll();
        // Reihenfolge umdrehen, damit Dock=Top oben mit Stable beginnt.
        for (var i = scans.Count - 1; i >= 0; i--)
        {
            var row = new BranchRow(scans[i]);
            row.CheckChanged += (s, e) =>
            {
                SyncContext();
                NotifyStateChanged();
            };
            _rows.Insert(0, row);
            listHost.Controls.Add(row);
        }

        var hint = new Label
        {
            Location = new Point(36, yStart + 240),
            Size = new Size(Width - 72, 40),
            BackColor = Palette.Bg,
            ForeColor = Palette.TextDim,
            Font = new Font("Segoe UI", 8.5f),
            Text =
                "Tipp: Nach der Installation patcht sich RagCord bei jedem Discord-Update automatisch neu.\n" +
                "Du musst dieses Setup also wirklich nur einmal pro Branch laufen lassen.",
        };
        Controls.Add(hint);

        SyncContext();
    }

    public override void OnEnter()
    {
        // Beim erneuten Betreten (Back vom Confirm) Status frisch ziehen,
        // damit eine zwischenzeitlich gepatcht/entfernte Installation
        // korrekt angezeigt wird.
        for (var i = 0; i < _rows.Count; i++)
        {
            _rows[i].Refresh(DiscordDetector.ScanOne(_rows[i].Install.Branch));
        }
        SyncContext();
        NotifyStateChanged();
    }

    private void SyncContext()
    {
        _ctx.SelectedInstalls = _rows
            .Where(r => r.IsChecked && r.Install.Status != InstallStatus.NotInstalled)
            .Select(r => r.Install)
            .ToList();
    }
}

// Theme-Alias, damit Palette nicht voll-qualifiziert werden muss.
file static class Palette
{
    public static System.Drawing.Color Bg       => Theme.Palette.Bg;
    public static System.Drawing.Color TextDim  => Theme.Palette.TextDim;
}
