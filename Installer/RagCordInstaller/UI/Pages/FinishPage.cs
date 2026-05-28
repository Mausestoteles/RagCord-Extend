// ──────────────────────────────────────────────
// FinishPage – Schritt 5: Ergebnis-Übersicht, Wizard schließen
// ──────────────────────────────────────────────
// Zeigt Success/Failure-Zustand mit Übersicht pro Branch. Optional ein
// „Discord starten"-Button bei erfolgreicher Installation.

using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using RagCordInstaller.Discord;
using RagCordInstaller.Theme;

namespace RagCordInstaller.UI.Pages;

internal sealed class FinishPage : WizardPage
{
    private readonly WizardContext _ctx;

    public override string Title => _ctx.Errors.Count == 0 ? "Erfolgreich" : "Mit Fehlern beendet";
    public override string Subtitle => _ctx.Errors.Count == 0
        ? "RagCord Extend ist nun in den ausgewaehlten Branches aktiv."
        : "Einige Operationen sind fehlgeschlagen. Details unten.";

    public override bool CanGoBack => false;
    public override string NextButtonText => "Schliessen";

    public FinishPage(WizardContext ctx)
    {
        _ctx = ctx;
        Build();
    }

    private void Build()
    {
        var yStart = RenderHeader();

        var summary = new Label
        {
            Location = new Point(36, yStart + 8),
            Size = new Size(Width - 72, 60),
            BackColor = Palette.Bg,
            ForeColor = _ctx.Errors.Count == 0 ? Palette.Success : Palette.Error,
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            Text = _ctx.Errors.Count == 0
                ? $"{_ctx.SelectedInstalls.Count} Branch(es) erfolgreich verarbeitet."
                : $"{_ctx.Errors.Count} Fehler bei {_ctx.SelectedInstalls.Count} Branch(es).",
        };
        Controls.Add(summary);

        var details = new TextBox
        {
            Location = new Point(36, yStart + 70),
            Size = new Size(Width - 72, 180),
            Multiline = true,
            ReadOnly = true,
            BackColor = Palette.BgElev,
            ForeColor = Palette.Text,
            BorderStyle = BorderStyle.None,
            Font = new Font("Consolas", 9f),
            ScrollBars = ScrollBars.Vertical,
            Text = BuildDetailsText(),
        };
        Controls.Add(details);

        if (_ctx.Errors.Count == 0
            && _ctx.Action != WizardAction.Uninstall
            && _ctx.SelectedInstalls.Count > 0)
        {
            var launchBtn = new FlatButton
            {
                Text = "Discord starten",
                Location = new Point(36, yStart + 264),
                Size = new Size(Width - 72, 36),
            };
            launchBtn.MakePrimary();
            launchBtn.Click += (s, e) =>
            {
                // Den ersten erfolgreich gepatchten Branch starten.
                var target = _ctx.SelectedInstalls.FirstOrDefault();
                if (target is { } t) DiscordProcess.TryStart(t.Branch);
            };
            Controls.Add(launchBtn);
        }
    }

    private string BuildDetailsText()
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("Branches:");
        foreach (var i in _ctx.SelectedInstalls)
        {
            sb.AppendLine($"  - {i.Branch.DisplayName}");
        }
        if (_ctx.Errors.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("Fehler:");
            foreach (var err in _ctx.Errors)
            {
                sb.AppendLine($"  ! {err}");
            }
        }
        else
        {
            sb.AppendLine();
            sb.AppendLine("Hinweis: Discord-Host-Updates werden in Zukunft");
            sb.AppendLine("automatisch mit-gepatched. Setup nur erneut starten,");
            sb.AppendLine("wenn ein weiterer Branch dazukommen soll.");
        }
        return sb.ToString();
    }
}
