// ──────────────────────────────────────────────
// ActionPage – Schritt 3: Aktion wählen + bestätigen
// ──────────────────────────────────────────────
// User entscheidet: Installieren / Reparieren / Deinstallieren.
// Reparieren ist nur sinnvoll, wenn mindestens ein gewählter Branch
// AlreadyInjected ist. Deinstallieren ebenso.
// Bei „Deinstallieren" gibt es eine Checkbox „Nutzerdaten ebenfalls löschen".

using System;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using RagCordInstaller.Discord;
using RagCordInstaller.Theme;

namespace RagCordInstaller.UI.Pages;

internal enum WizardAction
{
    Install,
    Repair,
    Uninstall,
}

internal sealed class ActionPage : WizardPage
{
    private readonly WizardContext _ctx;
    private RadioButton? _installRb;
    private RadioButton? _repairRb;
    private RadioButton? _uninstallRb;
    private CheckBox? _purgeDataCheck;
    private Label? _summary;

    public override string Title => "Aktion waehlen";
    public override string Subtitle =>
        "Was soll auf den ausgewaehlten Discord-Branches geschehen?";

    public override string NextButtonText => _ctx.Action switch
    {
        WizardAction.Install   => "Installieren",
        WizardAction.Repair    => "Reparieren",
        WizardAction.Uninstall => "Deinstallieren",
        _ => "Weiter",
    };

    public ActionPage(WizardContext ctx)
    {
        _ctx = ctx;
        Build();
    }

    private void Build()
    {
        var yStart = RenderHeader();

        _installRb = MakeRadio(
            yStart + 4,
            "Installieren",
            "Patcht die ausgewaehlten Branches und legt die Mod-Dateien ab.",
            WizardAction.Install);

        _repairRb = MakeRadio(
            yStart + 64,
            "Reparieren",
            "Schreibt Stub & Mod-Dateien fuer bereits installierte Branches neu.",
            WizardAction.Repair);

        _uninstallRb = MakeRadio(
            yStart + 124,
            "Deinstallieren",
            "Entfernt RagCord aus den ausgewaehlten Branches.",
            WizardAction.Uninstall);

        _purgeDataCheck = new CheckBox
        {
            Text = "Nutzerdaten (%AppData%\\RagCord) ebenfalls loeschen",
            Location = new Point(60, yStart + 188),
            AutoSize = true,
            BackColor = Palette.Bg,
            ForeColor = Palette.TextDim,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 8.5f),
            Visible = false,
        };
        _purgeDataCheck.CheckedChanged += (s, e) =>
        {
            _ctx.PurgeUserData = _purgeDataCheck!.Checked;
        };
        Controls.Add(_purgeDataCheck);

        _summary = new Label
        {
            Location = new Point(36, yStart + 230),
            Size = new Size(Width - 72, 60),
            BackColor = Palette.BgElev,
            ForeColor = Palette.TextDim,
            Font = new Font("Segoe UI", 8.5f),
            Padding = new Padding(12, 8, 12, 8),
            BorderStyle = BorderStyle.None,
            Text = "",
        };
        Controls.Add(_summary);

        // Standard-Vorauswahl bestimmen anhand des Status der gewählten Branches.
        var hasInjected = _ctx.SelectedInstalls.Any(i => i.Status == InstallStatus.AlreadyInjected);
        var allInjected = _ctx.SelectedInstalls.Count > 0
                          && _ctx.SelectedInstalls.All(i => i.Status == InstallStatus.AlreadyInjected);

        if (allInjected) _repairRb.Checked = true;
        else _installRb.Checked = true;

        // Repair-Option ausgrauen wenn keiner der gewählten Branches injected ist.
        _repairRb.Enabled = hasInjected;
        _uninstallRb.Enabled = hasInjected;

        UpdateSummary();
    }

    private RadioButton MakeRadio(int y, string title, string desc, WizardAction action)
    {
        // Großzügig: ein klickbares Panel pro Option mit Radio + Title + Desc.
        var panel = new Panel
        {
            Location = new Point(36, y),
            Size = new Size(Width - 72, 56),
            BackColor = Palette.BgElev,
        };

        var rb = new RadioButton
        {
            Location = new Point(14, 18),
            Size = new Size(20, 20),
            FlatStyle = FlatStyle.Flat,
            BackColor = Palette.BgElev,
            ForeColor = Palette.Text,
        };
        rb.FlatAppearance.BorderColor = Palette.Accent;
        rb.CheckedChanged += (s, e) =>
        {
            if (rb.Checked)
            {
                _ctx.Action = action;
                _purgeDataCheck!.Visible = action == WizardAction.Uninstall;
                UpdateSummary();
                NotifyStateChanged();
            }
        };

        var titleLbl = new Label
        {
            Text = title,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = Palette.Text,
            BackColor = Palette.BgElev,
            Location = new Point(40, 8),
            AutoSize = true,
        };
        var descLbl = new Label
        {
            Text = desc,
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Palette.TextDim,
            BackColor = Palette.BgElev,
            Location = new Point(40, 28),
            AutoSize = true,
        };

        panel.Controls.Add(rb);
        panel.Controls.Add(titleLbl);
        panel.Controls.Add(descLbl);

        // Klick irgendwo auf das Panel/Labels selektiert auch das Radio.
        void ClickPanel(object? s, EventArgs e) { if (rb.Enabled) rb.Checked = true; }
        panel.Click += ClickPanel;
        titleLbl.Click += ClickPanel;
        descLbl.Click += ClickPanel;

        Controls.Add(panel);
        return rb;
    }

    private void UpdateSummary()
    {
        var branches = string.Join(", ", _ctx.SelectedInstalls.Select(i => i.Branch.DisplayName));
        var verb = _ctx.Action switch
        {
            WizardAction.Install   => "Installation",
            WizardAction.Repair    => "Reparatur",
            WizardAction.Uninstall => "Deinstallation",
            _ => "Aktion",
        };
        _summary!.Text =
            $"{verb} auf {_ctx.SelectedInstalls.Count} Branch(es): {branches}.\n" +
            (_ctx.Action == WizardAction.Uninstall && _ctx.PurgeUserData
                ? "Nutzerdaten werden ebenfalls geloescht."
                : "Nutzerdaten bleiben erhalten.");
    }

    public override bool OnLeave(bool isForward)
    {
        if (!isForward) return true;
        // Sanity-Check bei Uninstall ohne injected Branch in der Auswahl.
        if (_ctx.Action != WizardAction.Install
            && !_ctx.SelectedInstalls.Any(i => i.Status == InstallStatus.AlreadyInjected))
        {
            MessageBox.Show(this,
                "Keiner der ausgewaehlten Branches ist aktuell mit RagCord versehen.",
                "Nichts zu tun",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return false;
        }
        return true;
    }
}
