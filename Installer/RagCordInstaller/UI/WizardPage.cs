// ──────────────────────────────────────────────
// WizardPage – Basis-Klasse für eine Seite im Multi-Step-Wizard
// ──────────────────────────────────────────────
// Jede Seite kennt:
//   - Title  (große Headline)
//   - Subtitle (zweizeilige Beschreibung darunter)
//   - CanGoNext / CanGoBack  (steuert Button-Enable im Footer)
//   - NextButtonText  (z.B. "Weiter" / "Installieren" / "Schliessen")
// Die MainForm hostet eine einzige Page zur Zeit in ihrem ContentPanel.

using System;
using System.Drawing;
using System.Windows.Forms;
using RagCordInstaller.Theme;

namespace RagCordInstaller.UI;

internal abstract class WizardPage : UserControl
{
    protected WizardPage()
    {
        BackColor = Palette.Bg;
        ForeColor = Palette.Text;
        Dock = DockStyle.Fill;
        DoubleBuffered = true;
    }

    /// <summary>Headline oben auf der Seite.</summary>
    public abstract string Title { get; }

    /// <summary>Beschreibungstext unter der Headline.</summary>
    public abstract string Subtitle { get; }

    /// <summary>Label des Next/Primary-Buttons (z.B. "Weiter", "Installieren", "Schliessen").</summary>
    public virtual string NextButtonText => "Weiter";

    /// <summary>Steuert, ob der „Weiter"/„Installieren"-Button aktiv ist.</summary>
    public virtual bool CanGoNext => true;

    /// <summary>Steuert, ob „Zurück" aktiv ist (i.d.R. auf der ersten und letzten Seite gesperrt).</summary>
    public virtual bool CanGoBack => true;

    /// <summary>Soll der Cancel/Close-Button verfügbar sein? Wird auf der Fortschritts-Seite ausgeblendet.</summary>
    public virtual bool ShowCloseButton => true;

    /// <summary>
    /// Wird vom Wizard ausgelöst, wenn sich CanGoNext / CanGoBack / NextButtonText
    /// ändert (z.B. „Mindestens einen Branch auswählen" → erst dann „Weiter" aktiv).
    /// </summary>
    public event EventHandler? StateChanged;

    protected void NotifyStateChanged() => StateChanged?.Invoke(this, EventArgs.Empty);

    /// <summary>Wird aufgerufen, sobald die Seite zur aktiven Seite des Wizards wird.</summary>
    public virtual void OnEnter() { }

    /// <summary>Wird vor dem Verlassen der Seite aufgerufen. Rückgabe false stoppt den Übergang.</summary>
    public virtual bool OnLeave(bool isForward) => true;

    /// <summary>
    /// Standard-Layout-Hilfe: legt den Title + Subtitle-Block an, gibt das
    /// untere Inhaltsbereich-Y zurück (ab dort kann die Page eigenes Layout machen).
    /// </summary>
    protected int RenderHeader(string? overrideTitle = null, string? overrideSubtitle = null)
    {
        Controls.Clear();

        var titleLabel = new Label
        {
            Text = overrideTitle ?? Title,
            Font = new Font("Segoe UI", 20f, FontStyle.Bold),
            ForeColor = Palette.Text,
            BackColor = Palette.Bg,
            Location = new Point(36, 24),
            AutoSize = true,
        };
        Controls.Add(titleLabel);

        var accent = new Panel
        {
            Location = new Point(36, 64),
            Size = new Size(48, 2),
            BackColor = Palette.Accent,
        };
        Controls.Add(accent);

        var subLabel = new Label
        {
            Text = overrideSubtitle ?? Subtitle,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
            ForeColor = Palette.TextDim,
            BackColor = Palette.Bg,
            Location = new Point(36, 78),
            Size = new Size(Width - 72, 40),
            AutoSize = false,
        };
        Controls.Add(subLabel);

        return 130;
    }
}
