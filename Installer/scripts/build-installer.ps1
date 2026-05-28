# =====================================================================
# Build-Pipeline fuer den RagCord-Installer
# =====================================================================
# Ablauf:
#   1. Vencord-Mod bauen   (pnpm build im Schwester-Verzeichnis)
#   2. dist/* -> Installer/RagCordInstaller/BuildAssets/ kopieren
#   3. dotnet publish -- self-contained, single-file
#   4. Output: Installer/RagCordInstaller/bin/Release/net8.0-windows/
#              win-x64/publish/RagCordInstaller.exe
#
# Hinweis: Nur ASCII-Zeichen verwenden! Windows PowerShell 5.1 liest
# .ps1-Files als ANSI/CP1252, nicht UTF-8 -- jeder Em-Dash oder Umlaut
# im Quellcode wuerde dort als Parser-Fehler explodieren.
#
# Aufruf in Windows PowerShell 5.1:
#   powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1
# Oder in PowerShell 7+:
#   pwsh -File scripts/build-installer.ps1
#
# Optionen:
#   -SkipModBuild   Mod-Build ueberspringen (nur UI-Iterationen)
#   -Configuration  Debug / Release  (Default: Release)

[CmdletBinding()]
param(
    [switch]$SkipModBuild,
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'

$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallerDir = Split-Path -Parent $ScriptDir
$RootDir      = Split-Path -Parent $InstallerDir
$VencordDir   = Join-Path  $RootDir 'Vencord'
$AssetsDir    = Join-Path  $InstallerDir 'RagCordInstaller\BuildAssets'
$ProjectFile  = Join-Path  $InstallerDir 'RagCordInstaller\RagCordInstaller.csproj'

Write-Host '======================================================' -ForegroundColor DarkRed
Write-Host '  RagCord Installer Build'                              -ForegroundColor Red
Write-Host '======================================================' -ForegroundColor DarkRed

# 1) Mod bauen --------------------------------------------------------
if (-not $SkipModBuild) {
    Write-Host "[1/3] Baue RagCord-Mod (pnpm build) in $VencordDir" -ForegroundColor Cyan

    if (-not (Test-Path (Join-Path $VencordDir 'package.json'))) {
        throw "Vencord-Quellen nicht gefunden unter $VencordDir."
    }

    Push-Location $VencordDir
    try {
        # pnpm wird ueber PATH aufgeloest -- gleich wie bei der Hand-Ausfuehrung.
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install fehlgeschlagen.' }
        & pnpm build
        if ($LASTEXITCODE -ne 0) { throw 'pnpm build fehlgeschlagen.' }
    } finally {
        Pop-Location
    }
} else {
    Write-Host '[1/3] Mod-Build uebersprungen (-SkipModBuild).' -ForegroundColor Yellow
}

# 2) Build-Assets ins Installer-Projekt kopieren ----------------------
Write-Host "[2/3] Kopiere Mod-dist nach $AssetsDir" -ForegroundColor Cyan

$DistDir = Join-Path $VencordDir 'dist'
if (-not (Test-Path $DistDir)) {
    throw "dist-Verzeichnis nicht gefunden: $DistDir"
}

# Alten Inhalt wegraeumen, damit umbenannte/entfernte Dateien nicht im
# Installer haengen bleiben.
if (Test-Path $AssetsDir) {
    Remove-Item -Path $AssetsDir -Recurse -Force
}
New-Item -ItemType Directory -Path $AssetsDir -Force | Out-Null

# Desktop-Variante: patcher.js, preload.js, renderer.js plus Maps und CSS.
# Vesktop-spezifische Builds (vencordDesktop*) lassen wir liegen -- das
# ist ein anderer Inject-Pfad und nicht das, was unser Wizard adressiert.
$wantedPatterns = @(
    'patcher.js',         'patcher.js.map',
    'preload.js',         'preload.js.map',
    'renderer.js',        'renderer.js.map',
    'renderer.css'
)

$copied = 0
foreach ($pattern in $wantedPatterns) {
    Get-ChildItem -Path $DistDir -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $AssetsDir -Force
        $copied++
    }
}

# Zusaetzliche Subdirs (z.B. dist/manifests/) mitnehmen.
Get-ChildItem -Path $DistDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $AssetsDir -Recurse -Force
}

if ($copied -eq 0) {
    throw "Keine erwartete Mod-Datei in $DistDir gefunden. Lief pnpm build erfolgreich durch?"
}
Write-Host "       $copied Top-Level-Asset(s) uebernommen."

# 3) Installer-EXE bauen ----------------------------------------------
Write-Host "[3/3] dotnet publish ($Configuration, win-x64, self-contained)" -ForegroundColor Cyan

& dotnet publish $ProjectFile `
    --configuration $Configuration `
    --runtime win-x64 `
    --self-contained true `
    /p:PublishSingleFile=true `
    /p:IncludeNativeLibrariesForSelfExtract=true `
    /p:EnableCompressionInSingleFile=true `
    /p:DebugType=embedded

if ($LASTEXITCODE -ne 0) { throw 'dotnet publish fehlgeschlagen.' }

$Output = Join-Path $InstallerDir "RagCordInstaller\bin\$Configuration\net8.0-windows\win-x64\publish\RagCordInstaller.exe"
if (Test-Path $Output) {
    $size = (Get-Item $Output).Length / 1MB
    Write-Host ''
    Write-Host '======================================================' -ForegroundColor Green
    Write-Host ('  Fertig: {0}' -f $Output)                              -ForegroundColor Green
    Write-Host ('  Groesse: {0:N1} MB' -f $size)                         -ForegroundColor Green
    Write-Host '======================================================' -ForegroundColor Green
} else {
    throw "Build hat keine RagCordInstaller.exe erzeugt unter $Output."
}
