@echo off
REM ================================================================
REM RagCord Installer Build - Doppelklick-Wrapper
REM ================================================================
REM Ruft scripts\build-installer.ps1 mit dem System-PowerShell auf
REM (PowerShell 5.1 oder 7+, je nach was im PATH ist).
REM Funktioniert per Doppelklick oder per `build.cmd` im Terminal.
REM ================================================================

setlocal
set "SCRIPT_DIR=%~dp0"

REM ExecutionPolicy explizit ueberschreiben, damit das auch bei restriktiven
REM Gruppenrichtlinien laeuft. -NoProfile = kein User-Profile-Load, schneller.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-installer.ps1" %*

set "EXITCODE=%ERRORLEVEL%"

REM Bei Doppelklick (kein Konsolen-Parent): Fenster offen halten, damit die
REM Fehlermeldung lesbar bleibt. Bei CLI-Aufruf einfach durchreichen.
if "%CMDCMDLINE:~0,7%"=="cmd /c " (
    echo.
    pause
)

exit /b %EXITCODE%
