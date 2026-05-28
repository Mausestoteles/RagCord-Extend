# RagCord Extend

Interner Discord-Client-Mod und Installer für die [RagnaMod](https://www.xn--ragnark-f1a.eu/)-Community.
Login-Gate gegen die RagnaMod-Auth-API, kuratierte Vencord-Plugin-Auswahl,
rot/schwarzes Theme, automatische Discord-Verifikation, Forum-Inbox im
Discord-Header.

> **Status:** internes Tool, nicht für die Öffentlichkeit gedacht.
> Kein Affiliated, Endorsed oder Sponsored von Vencord, Discord Inc. oder
> sonstigen Drittparteien.

## Was drin ist

| Ordner | Inhalt |
|---|---|
| [Vencord/](Vencord) | Der eigentliche Discord-Client-Mod (Vencord-Fork). Login-Gate, RagCord-Plugins, Theme. |
| [Installer/](Installer) | Windows-Installer (.NET 8 / WinForms) — Wizard, der die Mod in Discord injiziert. |

Beide Ordner haben ihr eigenes README mit Details.

## Schnellstart (Bauen)

Voraussetzungen: Node.js ≥ 18, pnpm, .NET 8 SDK, Windows PowerShell 5.1+ oder pwsh 7+.

```powershell
cd Installer
.\build.cmd
```

Das Skript baut den Mod (`pnpm build` in `Vencord/`), packt die Build-Assets
als embedded Resources in den Installer und produziert eine self-contained
`RagCordInstaller.exe` (~70 MB). Output:

```
Installer/RagCordInstaller/bin/Release/net8.0-windows/win-x64/publish/RagCordInstaller.exe
```

## Auto-Updater

Die Mod nutzt Vencords HTTP-Updater gegen dieses GitHub-Repo. Konfiguration:

- Default: `git remote get-url origin` (im Build eingebacken)
- Override per env-Var: `RAGCORD_UPDATE_REPO=<owner>/<repo>`

Releases sollten ein `SHA256SUMS`-Asset mitliefern — der Updater prüft alle
heruntergeladenen Files dagegen (siehe [Vencord/SECURITY.md](Vencord/SECURITY.md)).

## Komponenten-Überblick

### Login-Gate
- Pickup einer existierenden RagnaMod-Launcher-Session (`%AppData%/RagnaMod Launcher/config.json`)
- Standard-Login gegen `/api/login`
- Offline-Login per Gründungs-Authority-Key (Ed25519-signiert, Level-5-Mitglieder)
- Custom Hero-Login-Fenster (520×640), rot/schwarz

### Eigene Plugins
- **RagCordAutoVerify** — sendet die Discord-User-ID nach Login an `/api/discord/link`
- **RagCordForumInbox** — rotes Forum-Postfach-Icon im Discord-Header mit Badge, Popover-Liste und Toast
- **RagCordNews** — Forum-News als Toast + Modal
- **RagCordProfile** — MC-Head als Profil-Badge

### Backend-Integration
Endpoints in der RagnaMod-Auth-API (separates Subsystem):
- `/api/login`, `/api/verify`, `/api/logout`, `/api/news`, `/api/notifications`
- `/api/discord/{link,link-founder,unlink,me,lookup}`

## Lizenz

GPL-3.0-or-later (geerbt vom Vencord-Upstream).
