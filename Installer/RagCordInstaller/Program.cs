// ──────────────────────────────────────────────
// RagCord Extend Installer – Entry point
// ──────────────────────────────────────────────
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 Mausi / RagnaMod

using System;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

namespace RagCordInstaller;

internal static class Program
{
    // Guard against the user double-clicking the .exe twice while the first
    // window is still booting. A second instance racing the first one over
    // file writes in resources/app.asar would corrupt the install half-way.
    private static Mutex? _singleInstance;

    [STAThread]
    private static void Main()
    {
        const string mutexName = "Global\\RagCordInstaller-SingleInstance-7f3b2a4e";
        _singleInstance = new Mutex(initiallyOwned: true, name: mutexName, out var createdNew);
        if (!createdNew)
        {
            // Another instance is up. Bail silently; no message box, no
            // dialog — the user already has the running window in front.
            return;
        }

        try
        {
            ApplicationConfiguration.Initialize();
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Surface unhandled UI-thread exceptions into a readable dialog
            // — far less mysterious than "RagCordInstaller has stopped working".
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, e) => ShowFatal(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                if (e.ExceptionObject is Exception ex) ShowFatal(ex);
            };

            Application.Run(new MainForm());
        }
        finally
        {
            _singleInstance.ReleaseMutex();
            _singleInstance.Dispose();
        }
    }

    private static void ShowFatal(Exception ex)
    {
        Debug.WriteLine(ex);
        MessageBox.Show(
            $"RagCord Installer ist auf einen unerwarteten Fehler gestoßen:\n\n{ex.Message}\n\n" +
            "Bitte melde das im RagnaMod-Discord mit dem Fehlertext.",
            "RagCord Installer – Fehler",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);
    }
}
