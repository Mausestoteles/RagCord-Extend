// ──────────────────────────────────────────────
// MainForm – Multi-Step-Wizard-Host
// ──────────────────────────────────────────────
// Layout:
//   ┌──────────────────────────────────────────┐
//   │  RagCord Setup                    [_][X] │   custom titlebar  (32 px)
//   ├──────────────────────────────────────────┤
//   │   ① ─── ② ─── ③ ─── ④ ─── ⑤              │   step indicator   (60 px)
//   ├──────────────────────────────────────────┤
//   │                                          │
//   │   <current WizardPage>                   │   content area     (rest)
//   │                                          │
//   │                                          │
//   ├──────────────────────────────────────────┤
//   │  [ Zurueck ]            [ Weiter > ]     │   footer           (60 px)
//   └──────────────────────────────────────────┘
//
// Größe 640 × 540 — genug Platz für die Branch-Liste + Aktion-Optionen ohne
// Scrollbar.

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using RagCordInstaller.Theme;
using RagCordInstaller.UI;
using RagCordInstaller.UI.Pages;

namespace RagCordInstaller;

internal sealed class MainForm : Form
{
    private const int FormWidth = 640;
    private const int FormHeight = 540;
    private const int TitleBarHeight = 32;
    private const int FooterHeight = 60;

    private readonly WizardContext _ctx = new();
    private readonly List<WizardPage> _pages = new();
    private int _currentIndex;

    private readonly Panel _content;
    private readonly StepIndicator _steps;
    private readonly FlatButton _backBtn;
    private readonly FlatButton _nextBtn;
    private readonly FlatButton _closeBtn;
    private readonly Label _titleLbl;

    public MainForm()
    {
        Text = "RagCord Extend Setup";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Palette.Bg;
        ForeColor = Palette.Text;
        Font = new Font("Segoe UI", 9f, FontStyle.Regular);
        Size = new Size(FormWidth, FormHeight);
        MinimumSize = new Size(FormWidth, FormHeight);
        MaximumSize = new Size(FormWidth, FormHeight);
        DoubleBuffered = true;
        KeyPreview = true;
        KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) Close(); };

        // ── Titlebar ──
        var bar = new Panel
        {
            Location = new Point(0, 0),
            Size = new Size(FormWidth, TitleBarHeight),
            BackColor = Palette.BgElev,
        };
        _titleLbl = new Label
        {
            Text = "RagCord Extend Setup",
            ForeColor = Palette.TextDim,
            BackColor = Palette.BgElev,
            Font = new Font("Segoe UI", 8.5f),
            Location = new Point(12, 8),
            AutoSize = true,
        };
        bar.Controls.Add(_titleLbl);

        var close = new Label
        {
            Text = "✕",
            ForeColor = Palette.TextDim,
            BackColor = Palette.BgElev,
            Font = new Font("Segoe UI", 11f),
            Location = new Point(FormWidth - 32, 4),
            Size = new Size(24, 24),
            TextAlign = ContentAlignment.MiddleCenter,
            Cursor = Cursors.Hand,
        };
        close.Click += (s, e) => ConfirmClose();
        close.MouseEnter += (s, e) => close.ForeColor = Palette.Accent;
        close.MouseLeave += (s, e) => close.ForeColor = Palette.TextDim;
        bar.Controls.Add(close);

        bar.MouseDown += BarDragStart;
        _titleLbl.MouseDown += BarDragStart;
        Controls.Add(bar);

        // ── Step-Indicator ──
        _steps = new StepIndicator
        {
            Location = new Point(0, TitleBarHeight),
            Size = new Size(FormWidth, 60),
        };
        _steps.SetSteps("Start", "Branches", "Aktion", "Lauf", "Fertig");
        Controls.Add(_steps);

        // ── Content-Bereich ──
        _content = new Panel
        {
            Location = new Point(0, TitleBarHeight + 60),
            Size = new Size(FormWidth, FormHeight - TitleBarHeight - 60 - FooterHeight),
            BackColor = Palette.Bg,
        };
        Controls.Add(_content);

        // ── Footer ──
        var footer = new Panel
        {
            Location = new Point(0, FormHeight - FooterHeight),
            Size = new Size(FormWidth, FooterHeight),
            BackColor = Palette.BgElev,
        };
        var sep = new Panel
        {
            Location = new Point(0, 0),
            Size = new Size(FormWidth, 1),
            BackColor = Palette.Border,
        };
        footer.Controls.Add(sep);

        _backBtn = new FlatButton
        {
            Text = "< Zurueck",
            Location = new Point(36, 12),
            Size = new Size(140, 36),
        };
        _backBtn.Click += (s, e) => GoBack();
        footer.Controls.Add(_backBtn);

        _closeBtn = new FlatButton
        {
            Text = "Abbrechen",
            Location = new Point(190, 12),
            Size = new Size(120, 36),
        };
        _closeBtn.Click += (s, e) => ConfirmClose();
        footer.Controls.Add(_closeBtn);

        _nextBtn = new FlatButton
        {
            Text = "Weiter >",
            Location = new Point(FormWidth - 36 - 160, 12),
            Size = new Size(160, 36),
        };
        _nextBtn.MakePrimary();
        _nextBtn.Click += (s, e) => GoNext();
        footer.Controls.Add(_nextBtn);

        Controls.Add(footer);

        // ── Pages instanziieren ──
        _pages.Add(new WelcomePage());
        _pages.Add(new BranchesPage(_ctx));
        _pages.Add(new ActionPage(_ctx));
        _pages.Add(new ProgressPage(_ctx));
        _pages.Add(new FinishPage(_ctx));

        foreach (var page in _pages)
        {
            page.StateChanged += (s, e) => RefreshButtons();
        }

        ShowPage(0);
    }

    private void ShowPage(int index)
    {
        if (index < 0 || index >= _pages.Count) return;

        var oldPage = _content.Controls.Count > 0 ? _content.Controls[0] as WizardPage : null;
        if (oldPage != null)
        {
            _content.Controls.Remove(oldPage);
        }

        // Die FinishPage wird erst NACH dem Run instanziiert (sonst sind die
        // Outcomes/Errors noch leer). Re-create wenn wir auf Index 4 wechseln.
        if (index == 4)
        {
            _pages[4] = new FinishPage(_ctx);
            _pages[4].StateChanged += (s, e) => RefreshButtons();
        }

        var page = _pages[index];
        _content.Controls.Add(page);
        _currentIndex = index;
        _steps.SetCurrent(index);
        _titleLbl.Text = $"RagCord Extend Setup  -  Schritt {index + 1} von {_pages.Count}";
        page.OnEnter();
        RefreshButtons();
    }

    private void GoNext()
    {
        var current = _pages[_currentIndex];
        if (!current.CanGoNext) return;
        if (!current.OnLeave(isForward: true)) return;

        if (_currentIndex == _pages.Count - 1)
        {
            // Letzte Seite: „Weiter" = „Schliessen".
            Close();
            return;
        }
        ShowPage(_currentIndex + 1);
    }

    private void GoBack()
    {
        var current = _pages[_currentIndex];
        if (!current.CanGoBack) return;
        if (!current.OnLeave(isForward: false)) return;
        ShowPage(_currentIndex - 1);
    }

    private void RefreshButtons()
    {
        var page = _pages[_currentIndex];
        _backBtn.Enabled = page.CanGoBack;
        _backBtn.Visible = page.CanGoBack;
        _nextBtn.Enabled = page.CanGoNext;
        _nextBtn.Text = page.NextButtonText;
        _closeBtn.Visible = page.ShowCloseButton;
    }

    private void ConfirmClose()
    {
        // Mitten im Patch-Lauf? Nicht abrechen lassen.
        if (_currentIndex == 3 && !_pages[3].CanGoNext)
        {
            MessageBox.Show(this,
                "Der Vorgang laeuft. Bitte abwarten, bis er fertig ist.",
                "Bitte warten", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        Close();
    }

    // ── Drag-to-move via WM_NCLBUTTONDOWN ──
    private const int WM_NCLBUTTONDOWN = 0xA1;
    private const int HTCAPTION = 0x2;
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
    private static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    private void BarDragStart(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        ReleaseCapture();
        SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, IntPtr.Zero);
    }
}
