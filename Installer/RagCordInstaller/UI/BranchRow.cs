// ──────────────────────────────────────────────
// BranchRow – eine Zeile pro Discord-Branch (Stable / PTB / Canary)
// ──────────────────────────────────────────────
// Hält: Checkbox (auswählbar / ausgegraut) + Branch-Name + Status-Tag.
// Status-Tag rendert farbig:
//   not installed → grau
//   installed      → weiß
//   already inject → rot (var--ragcord-accent)
//   broken         → orange/error

using System;
using System.Drawing;
using System.Windows.Forms;
using RagCordInstaller.Discord;
using RagCordInstaller.Theme;

namespace RagCordInstaller.UI;

internal sealed class BranchRow : Panel
{
    private readonly CheckBox _check;
    private readonly Label _name;
    private readonly Label _status;

    public DiscordInstall Install { get; private set; }

    public bool IsChecked => _check.Checked;

    public event EventHandler? CheckChanged;

    public BranchRow(DiscordInstall install)
    {
        Install = install;
        Height = 44;
        Dock = DockStyle.Top;
        BackColor = Palette.BgElev;
        Padding = new Padding(12, 6, 12, 6);
        Margin = new Padding(0, 0, 0, 6);

        _check = new CheckBox
        {
            FlatStyle = FlatStyle.Flat,
            BackColor = Palette.BgElev,
            ForeColor = Palette.Text,
            Location = new Point(12, 12),
            Size = new Size(16, 16),
            AutoSize = false,
            Padding = new Padding(0),
            Margin = new Padding(0),
        };
        _check.FlatAppearance.BorderColor = Palette.Border;
        _check.CheckedChanged += (s, e) => CheckChanged?.Invoke(this, EventArgs.Empty);

        _name = new Label
        {
            Text = install.Branch.DisplayName,
            Font = new Font("Segoe UI", 10f, FontStyle.Regular),
            ForeColor = Palette.Text,
            BackColor = Palette.BgElev,
            Location = new Point(36, 12),
            AutoSize = true,
        };

        _status = new Label
        {
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            BackColor = Palette.BgElev,
            AutoSize = true,
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            TextAlign = ContentAlignment.MiddleRight,
        };

        Controls.Add(_check);
        Controls.Add(_name);
        Controls.Add(_status);

        Resize += (s, e) => LayoutStatus();
        ApplyStatusVisuals();
        LayoutStatus();
    }

    private void LayoutStatus()
    {
        // Rechtsbündig am rechten Innenrand des Panels.
        _status.Location = new Point(Width - _status.Width - 14, 14);
    }

    private void ApplyStatusVisuals()
    {
        switch (Install.Status)
        {
            case InstallStatus.NotInstalled:
                _status.Text = "NICHT INSTALLIERT";
                _status.ForeColor = Palette.TextDim;
                _check.Enabled = false;
                _name.ForeColor = Palette.TextDim;
                break;
            case InstallStatus.Installed:
                _status.Text = "BEREIT";
                _status.ForeColor = Palette.Success;
                _check.Enabled = true;
                _check.Checked = true;
                break;
            case InstallStatus.AlreadyInjected:
                _status.Text = "INSTALLIERT";
                _status.ForeColor = Palette.Accent;
                _check.Enabled = true;
                _check.Checked = false;
                break;
            case InstallStatus.Broken:
                _status.Text = "REPARIEREN";
                _status.ForeColor = Palette.Error;
                _check.Enabled = true;
                _check.Checked = false;
                break;
        }
    }

    /// <summary>Frischt den Branch-Status (z.B. nach einem Inject-Run) neu.</summary>
    public void Refresh(DiscordInstall updated)
    {
        Install = updated;
        ApplyStatusVisuals();
        LayoutStatus();
    }
}
