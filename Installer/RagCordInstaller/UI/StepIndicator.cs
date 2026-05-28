// ──────────────────────────────────────────────
// StepIndicator – horizontaler Fortschritts-Strip oben im Wizard
// ──────────────────────────────────────────────
// Zeichnet pro Schritt einen Kreis (gefüllt = abgeschlossen, ring = aktiv,
// hohl-grau = ausstehend) mit Verbindungslinien dazwischen und Beschriftung
// darunter. Renderfläche: 100 % Breite × 60 px Höhe.

using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace RagCordInstaller.UI;

internal sealed class StepIndicator : Panel
{
    private string[] _steps = System.Array.Empty<string>();
    private int _current;

    public StepIndicator()
    {
        Height = 60;
        Dock = DockStyle.Top;
        BackColor = Theme.Palette.Bg;
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint
                 | ControlStyles.OptimizedDoubleBuffer
                 | ControlStyles.UserPaint
                 | ControlStyles.ResizeRedraw, true);
    }

    public void SetSteps(params string[] steps)
    {
        _steps = steps;
        _current = 0;
        Invalidate();
    }

    public void SetCurrent(int index)
    {
        _current = index;
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        if (_steps.Length == 0) return;

        // Knotenpunkte gleichmäßig über die Breite verteilen, mit etwas
        // Innenabstand links/rechts, damit die Beschriftungen am Rand nicht
        // abgeschnitten werden.
        const int circle = 22;
        const int padX = 32;
        var y = 16;
        var labelY = y + circle + 6;
        var usable = Width - 2 * padX;
        var step = _steps.Length > 1 ? usable / (_steps.Length - 1) : 0;

        // Verbindungslinien zuerst, damit die Kreise darüber sitzen.
        for (var i = 0; i < _steps.Length - 1; i++)
        {
            var x1 = padX + i * step + circle / 2;
            var x2 = padX + (i + 1) * step + circle / 2;
            var done = i < _current;
            using var pen = new Pen(done ? Theme.Palette.Accent : Theme.Palette.Border, 2f);
            g.DrawLine(pen, x1 + circle / 2, y + circle / 2, x2 - circle / 2, y + circle / 2);
        }

        // Knoten + Labels.
        using var labelFont = new Font("Segoe UI", 7.5f, FontStyle.Bold);
        for (var i = 0; i < _steps.Length; i++)
        {
            var x = padX + i * step;
            var rect = new Rectangle(x, y, circle, circle);

            if (i < _current)
            {
                // Abgeschlossen — gefüllter Kreis mit Häkchen.
                using var brush = new SolidBrush(Theme.Palette.Accent);
                g.FillEllipse(brush, rect);
                using var pen = new Pen(Color.White, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
                g.DrawLines(pen, new[]
                {
                    new Point(x + 6, y + 11),
                    new Point(x + 10, y + 15),
                    new Point(x + 16, y + 7),
                });
            }
            else if (i == _current)
            {
                // Aktiv — Akzent-Ring, gefüllter Innenpunkt.
                using var pen = new Pen(Theme.Palette.Accent, 2.5f);
                g.DrawEllipse(pen, rect);
                var inner = new Rectangle(x + 6, y + 6, circle - 12, circle - 12);
                using var brush = new SolidBrush(Theme.Palette.Accent);
                g.FillEllipse(brush, inner);
            }
            else
            {
                // Ausstehend — grauer Ring.
                using var pen = new Pen(Theme.Palette.Border, 2f);
                g.DrawEllipse(pen, rect);
                using var brush = new SolidBrush(Theme.Palette.BgElev);
                g.FillEllipse(brush, new Rectangle(x + 2, y + 2, circle - 4, circle - 4));
            }

            var label = _steps[i];
            var labelColor = i == _current
                ? Theme.Palette.Text
                : i < _current ? Theme.Palette.TextDim
                : Theme.Palette.TextDim;

            var labelSize = TextRenderer.MeasureText(g, label, labelFont);
            var labelX = x + circle / 2 - labelSize.Width / 2;
            TextRenderer.DrawText(g, label, labelFont,
                new Point(labelX, labelY), labelColor);
        }
    }
}
