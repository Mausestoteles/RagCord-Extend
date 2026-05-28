// ──────────────────────────────────────────────
// ProgressPage – Schritt 4: führt die Aktion aus, zeigt Fortschritt
// ──────────────────────────────────────────────
// Wird beim Eintritt automatisch losgetreten — Discord beenden, dann pro
// gewähltem Branch die jeweilige Operation. „Zurück" ist hier gesperrt,
// „Weiter" wird erst nach Abschluss aktiv (führt zur FinishPage).

using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using RagCordInstaller.Discord;
using RagCordInstaller.Installation;
using RagCordInstaller.Theme;

namespace RagCordInstaller.UI.Pages;

internal sealed class ProgressPage : WizardPage
{
    private readonly WizardContext _ctx;
    private Label? _stage;
    private Label? _detail;
    private ProgressBar? _bar;
    private bool _started;
    private bool _completed;

    public override string Title => _ctx.Action switch
    {
        WizardAction.Install   => "Installiere",
        WizardAction.Repair    => "Repariere",
        WizardAction.Uninstall => "Deinstalliere",
        _ => "Verarbeite",
    };
    public override string Subtitle => "Bitte warten — dieser Schritt darf nicht unterbrochen werden.";

    public override bool CanGoBack => false;
    public override bool CanGoNext => _completed;
    public override bool ShowCloseButton => false;
    public override string NextButtonText => "Weiter";

    public ProgressPage(WizardContext ctx)
    {
        _ctx = ctx;
        Build();
    }

    private void Build()
    {
        var yStart = RenderHeader();

        _stage = new Label
        {
            Location = new Point(36, yStart + 16),
            Size = new Size(Width - 72, 28),
            BackColor = Palette.Bg,
            ForeColor = Palette.Text,
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            Text = "Initialisiere ...",
        };
        Controls.Add(_stage);

        _bar = new ProgressBar
        {
            Location = new Point(36, yStart + 52),
            Size = new Size(Width - 72, 8),
            Style = ProgressBarStyle.Continuous,
            Minimum = 0,
            Maximum = 100,
            Value = 0,
        };
        Controls.Add(_bar);

        _detail = new Label
        {
            Location = new Point(36, yStart + 76),
            Size = new Size(Width - 72, 200),
            BackColor = Palette.Bg,
            ForeColor = Palette.TextDim,
            Font = new Font("Consolas", 9f),
            Text = "",
        };
        Controls.Add(_detail);
    }

    public override async void OnEnter()
    {
        if (_started) return;
        _started = true;
        await RunAsync();
    }

    private async Task RunAsync()
    {
        try
        {
            var total = _ctx.SelectedInstalls.Count + 1; // +1 = Process-Kill-Schritt
            var done = 0;
            void Tick(string stage, string? line = null)
            {
                _stage!.Text = stage;
                if (line != null) Append(line);
                _bar!.Value = Math.Min(100, (done * 100) / Math.Max(1, total));
                Application.DoEvents();
            }

            Tick("Schliesse laufende Discord-Prozesse ...", "[*] Beende Discord-Instanzen.");
            await Task.Run(DiscordProcess.KillAll);
            done++;

            foreach (var install in _ctx.SelectedInstalls)
            {
                _ctx.Outcomes.Add(install);
                switch (_ctx.Action)
                {
                    case WizardAction.Install:
                    case WizardAction.Repair:
                        Tick($"Patche {install.Branch.DisplayName} ...",
                             $"[>] Patche {install.Branch.DisplayName}");
                        try
                        {
                            await Task.Run(() => Injector.Inject(install));
                            Append($"[OK] {install.Branch.DisplayName}");
                        }
                        catch (InjectorException ex)
                        {
                            Append($"[ERR] {ex.Message}");
                            _ctx.Errors.Add(ex.Message);
                        }
                        break;

                    case WizardAction.Uninstall:
                        Tick($"Entferne {install.Branch.DisplayName} ...",
                             $"[>] Entferne {install.Branch.DisplayName}");
                        try
                        {
                            await Task.Run(() => Uninjector.Uninject(install));
                            Append($"[OK] {install.Branch.DisplayName}");
                        }
                        catch (UninjectorException ex)
                        {
                            Append($"[ERR] {ex.Message}");
                            _ctx.Errors.Add(ex.Message);
                        }
                        break;
                }
                done++;
                _bar!.Value = Math.Min(100, (done * 100) / total);
                Application.DoEvents();
            }

            if (_ctx.Action == WizardAction.Uninstall && _ctx.PurgeUserData)
            {
                Tick("Loesche Nutzerdaten ...", "[>] %AppData%\\RagCord aufraeumen");
                await Task.Run(Uninjector.PurgeUserData);
                Append("[OK] Nutzerdaten entfernt");
            }

            _bar!.Value = 100;
            _stage!.Text = _ctx.Errors.Count == 0 ? "Fertig." : "Mit Fehlern beendet.";
        }
        finally
        {
            _completed = true;
            NotifyStateChanged();
        }
    }

    private void Append(string line)
    {
        _detail!.Text = string.IsNullOrEmpty(_detail.Text)
            ? line
            : _detail.Text + Environment.NewLine + line;
    }
}
