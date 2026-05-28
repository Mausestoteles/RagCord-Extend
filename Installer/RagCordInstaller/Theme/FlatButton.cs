// ──────────────────────────────────────────────
// FlatButton – einheitlicher Knopf mit Hover/Press-Übergang
// ──────────────────────────────────────────────
// WinForms' Standard-Button rendert auf dunklem Hintergrund eklig. Wir
// zeichnen flach, mit 1px-Border und 100 ms-Press-Feedback wie das Login-Gate.

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace RagCordInstaller.Theme;

internal sealed class FlatButton : Button
{
    private bool _hover;
    private bool _pressed;
    private Color _normalBg = Palette.BgElev;
    private Color _normalFg = Palette.Text;
    private Color _hoverBg = Palette.BgHover;
    private Color _pressedBg = Palette.BgElev;
    private Color _border = Palette.Border;

    public FlatButton()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint
                 | ControlStyles.OptimizedDoubleBuffer
                 | ControlStyles.UserPaint
                 | ControlStyles.ResizeRedraw
                 | ControlStyles.SupportsTransparentBackColor, true);
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        BackColor = _normalBg;
        ForeColor = _normalFg;
        Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
        Cursor = Cursors.Hand;
        Height = 36;
    }

    /// <summary>Stylt den Button als primäre Aktion (Akzentfarbe).</summary>
    public void MakePrimary()
    {
        _normalBg = Palette.Accent;
        _hoverBg = Palette.AccentHover;
        _pressedBg = Palette.AccentPress;
        _normalFg = Palette.Text;
        _border = Palette.Accent;
        Invalidate();
    }

    /// <summary>Stylt den Button als destruktive Aktion (rot, aber Text-only-ähnlich).</summary>
    public void MakeDanger()
    {
        _normalBg = Palette.BgElev;
        _hoverBg = Color.FromArgb(60, Palette.AccentHover);
        _pressedBg = Palette.AccentPress;
        _normalFg = Palette.Accent;
        _border = Palette.Accent;
        Invalidate();
    }

    protected override void OnMouseEnter(EventArgs e)  { base.OnMouseEnter(e);  _hover = true;  Invalidate(); }
    protected override void OnMouseLeave(EventArgs e)  { base.OnMouseLeave(e);  _hover = false; _pressed = false; Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); _pressed = true; Invalidate(); }
    protected override void OnMouseUp(MouseEventArgs e)   { base.OnMouseUp(e);   _pressed = false; Invalidate(); }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        var bg = !Enabled
            ? Color.FromArgb(120, _normalBg)
            : _pressed ? _pressedBg
            : _hover ? _hoverBg
            : _normalBg;

        var rect = new Rectangle(0, 0, Width - 1, Height - 1);
        using (var brush = new SolidBrush(bg)) g.FillRectangle(brush, rect);
        using (var pen = new Pen(_border)) g.DrawRectangle(pen, rect);

        var fg = Enabled ? _normalFg : Color.FromArgb(120, _normalFg);
        TextRenderer.DrawText(
            g, Text, Font, ClientRectangle, fg,
            TextFormatFlags.HorizontalCenter
            | TextFormatFlags.VerticalCenter
            | TextFormatFlags.EndEllipsis);
    }
}
