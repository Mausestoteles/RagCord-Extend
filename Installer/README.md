# RagCord Extend Installer

Ein nativer Windows-Installer für [RagCord Extend](../Vencord) — den
RagnaMod-Discord-Client-Mod. Doppelklick auf die `.exe`, einmal
„Installieren", fertig: Discord startet ab dem nächsten Mal mit dem
RagCord-Login-Gate.

## Was er tut

Pro ausgewähltem Discord-Branch (Stable / PTB / Canary):

1. Laufende Discord-Prozesse beenden.
2. Im aktuellsten `app-X.Y.Z/resources/`:
   - `app.asar` → `_app.asar` (umbenennen)
   - `app.asar/` als Verzeichnis anlegen mit
     - `package.json`  →  `{ "name": "discord", "main": "index.js" }`
     - `index.js`      →  `require("%AppData%/RagCord/dist/patcher.js");`
3. Die eingebetteten Mod-Dateien (`patcher.js`, `preload.js`, `renderer.js`)
   nach `%AppData%/RagCord/dist/` entpacken.
4. Im `install-manifest.json` notieren, welche Branches gepatcht wurden
   (für den späteren Uninstall).

Das genau gleiche Schema verwendet [patchWin32Updater.ts](../Vencord/src/main/patchWin32Updater.ts),
sodass Discords eigene Host-Updates RagCord automatisch in den neuen
`app-X.Y.Z`-Ordner mitnehmen — der Installer muss also wirklich nur einmal
laufen.

## Aufbau

| Pfad | Was drin ist |
|---|---|
| [RagCordInstaller/](RagCordInstaller/) | .NET-8-WinForms-Projekt |
| [RagCordInstaller/Program.cs](RagCordInstaller/Program.cs) | Entry, Single-Instance-Mutex |
| [RagCordInstaller/MainForm.cs](RagCordInstaller/MainForm.cs) | Wizard-Fenster (rot/schwarz, code-first) |
| [RagCordInstaller/Discord/](RagCordInstaller/Discord/) | Branch-Detection + Process-Kill |
| [RagCordInstaller/Installation/](RagCordInstaller/Installation/) | Inject / Uninject / Manifest |
| [RagCordInstaller/Theme/](RagCordInstaller/Theme/) | Palette + FlatButton |
| [RagCordInstaller/BuildAssets/](RagCordInstaller/BuildAssets/) | wird vom Build-Skript befüllt (gitignored) |
| [scripts/build-installer.ps1](scripts/build-installer.ps1) | Build-Pipeline (Mod + EXE) |

## Bauen

**Voraussetzungen** (einmalig):

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Node.js ≥ 18 + `pnpm` (für den Mod-Build)
- Windows PowerShell 5.1 reicht — `pwsh` (PS 7+) ist optional

**Bauen — einfachster Weg (Doppelklick):**

```
Installer\build.cmd
```

**Bauen — aus dem Terminal:**

```powershell
cd "L:\Ragnarök Eco System\Software\RagCord Extend\Installer"
.\build.cmd
# oder direkt:
powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1
```

Das Skript baut den Mod (`pnpm build` in `../Vencord`), kopiert das
`dist/`-Resultat nach `RagCordInstaller/BuildAssets/`, und ruft
`dotnet publish` auf. Output:

```
RagCordInstaller/bin/Release/net8.0-windows/win-x64/publish/RagCordInstaller.exe
```

Eine einzelne, self-contained .exe (~60–80 MB durch den eingebackenen
.NET-Runtime). Die Datei lässt sich umbenennen, per Mail/Cloud
weitergeben — keine Installation des .NET-Runtimes auf dem Ziel-PC nötig.

### Schnellere Iterationen

Wenn du nur am Installer-UI arbeitest und der Mod-Stand stabil ist:

```powershell
.\build.cmd -SkipModBuild
```

Dann wird das vorher kopierte `BuildAssets/` einfach wiederverwendet.

### Debug-Lauf direkt aus dem Solution

```powershell
dotnet run --project RagCordInstaller/RagCordInstaller.csproj
```

Achtung: Im Debug-Run müssen die Build-Assets trotzdem nach
`RagCordInstaller/BuildAssets/` kopiert worden sein — sonst wirft
`Injector.Inject` „Im Installer ist kein patcher.js eingebettet".

## App-Icon

`RagCordInstaller/Resources/ragcord.ico` wird von der `.csproj`
([RagCordInstaller.csproj](RagCordInstaller/RagCordInstaller.csproj))
als `<ApplicationIcon>` referenziert. Solange noch kein Icon abgelegt ist,
entweder ein `ragcord.ico` (256×256 mit allen Auflösungen drin) dort
ablegen, oder die `<ApplicationIcon>`-Zeile temporär auskommentieren.

## Anti-Virus-Heads-Up

Self-contained, single-file .NET-EXEs werden gelegentlich von Defender
oder Drittanbieter-AV gemeldet (Generic.MSIL.* o.ä.). Das ist Heuristik,
keine echte Detection — der Quellcode ist offen, der Build ist
deterministisch.

Längerfristig: Authenticode-signieren. Ein RagnaMod-Code-Signing-Cert
(Sectigo / SSL.com, ~$70/Jahr) entschärft 99 % der False-Positives.

## Deinstallation

Im Wizard auf „Deinstallieren" klicken. Standardmäßig bleibt
`%AppData%/RagCord` (Login-Session, Themes, QuickCSS, Plugin-Settings)
erhalten — beim nächsten Install ist alles wieder da. Wer wirklich
Tabula rasa will: Checkbox „Nutzerdaten ebenfalls löschen" aktivieren.
