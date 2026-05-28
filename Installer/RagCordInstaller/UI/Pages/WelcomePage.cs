// ──────────────────────────────────────────────
// WelcomePage – Schritt 1: Begrüßung + kurze Erklärung
// ──────────────────────────────────────────────
// Hat keine interaktiven Steuerelemente — nur Branding und ein paar
// erklärende Zeilen. „Zurück" ist hier gesperrt.

using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using RagCordInstaller.Theme;

namespace RagCordInstaller.UI.Pages;

internal sealed class WelcomePage : WizardPage
{
    public override string Title => "Willkommen";
    public override string Subtitle =>
        "Dieses Setup installiert RagCord Extend in deine Discord-Installation.\n" +
        "Du brauchst einen RagnaMod-Account, um Discord nach der Installation zu starten.";

    public override bool CanGoBack => false;
    public override string NextButtonText => "Weiter";

    public WelcomePage() => Build();

    private void Build()
    {
        var yStart = RenderHeader();

        // Hero-Emblem links + Beschreibungstext rechts
        var emblem = new EmblemPanel
        {
            Location = new Point(36, yStart + 4),
            Size = new Size(96, 96),
        };
        Controls.Add(emblem);

        var info = new Label
        {
            Location = new Point(160, yStart + 8),
            Size = new Size(Width - 200, 200),
            BackColor = Palette.Bg,
            ForeColor = Palette.Text,
            Font = new Font("Segoe UI", 10f),
            Text =
                "Was passiert hier?\n" +
                "\n" +
                "• Discord wird vor der Patch-Aktion geschlossen.\n" +
                "• Pro Branch wird die app.asar gegen einen Stub-Loader getauscht,\n" +
                "  der RagCord beim Start mit-lädt.\n" +
                "• Das Original wird als _app.asar daneben gesichert.\n" +
                "• Die Mod-Dateien landen in %AppData%\\RagCord.\n" +
                "\n" +
                "Discord-Host-Updates werden danach automatisch mit-gepatched.",
        };
        Controls.Add(info);
    }

    /// <summary>Größerer roter Kreis mit weißem „R" – dasselbe Motiv wie im Login-Gate.</summary>
    private sealed class EmblemPanel : Panel
    {
        public EmblemPanel()
        {
            BackColor = Palette.Bg;
            DoubleBuffered = true;
            SetStyle(ControlStyles.AllPaintingInWmPaint
                     | ControlStyles.OptimizedDoubleBuffer
                     | ControlStyles.UserPaint
                     | ControlStyles.ResizeRedraw, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

            var rect = new Rectangle(2, 2, Width - 4, Height - 4);

            using var path = new GraphicsPath();
            path.AddEllipse(rect);

            using var brush = new PathGradientBrush(path)
            {
                CenterColor = Palette.AccentHover,
                SurroundColors = new[] { Palette.AccentPress },
            };
            g.FillEllipse(brush, rect);

            using var ring = new Pen(Color.FromArgb(40, 0, 0, 0), 4f);
            g.DrawEllipse(ring, rect);

            using var font = new Font("Segoe UI", 42f, FontStyle.Bold);
            TextRenderer.DrawText(g, "R", font, ClientRectangle, Color.White,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        }
    }
}
