# =====================================================================
# RagCord-Extend - Release-Pipeline
# =====================================================================
# Korrekte Reihenfolge um einen neuen Mod-Release auf GitHub zu bringen:
#   1. Aenderungen committen   (HEAD bewegt sich auf den neuen SHA)
#   2. Mod NACH dem Commit bauen   (esbuild backt diesen SHA in patcher.js
#                                   via ~git-remote- + gitHashPlugin)
#   3. SHA256SUMS-Datei erzeugen
#   4. Tag setzen + push
#   5. gh release create --target <SHA>   (NICHT --target main, sonst zeigt
#                                          target_commitish nur den Branch-
#                                          namen und der Updater kommt
#                                          durcheinander)
#
# Aufruf:
#   pwsh -File scripts\publish-release.ps1 -Tag v1.0.2 -Notes "Was neu ist"
#
# Voraussetzung:
#   - alle gewuenschten Aenderungen sind bereits committet UND gepusht
#     (Skript prueft, dass HEAD == origin/main)
#   - $env:GH_TOKEN ist gesetzt (Personal Access Token mit repo-Scope)

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$Tag,
    [string]$Notes = '',
    [string]$Title = '',
    [string]$Repo = 'Mausestoteles/RagCord-Extend'
)

$ErrorActionPreference = 'Stop'
if (-not $env:GH_TOKEN) {
    throw 'Setze $env:GH_TOKEN (Personal Access Token mit repo-Scope) bevor du das ausfuehrst.'
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = Split-Path -Parent $ScriptDir
$VencordDir= Join-Path $Root 'Vencord'
$Dist      = Join-Path $VencordDir 'dist'

# 1) Sanity-Check: HEAD muss auf main sein UND gepusht
Push-Location $Root
$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') { Pop-Location; throw "Erwartet branch=main, gefunden $branch" }

$local  = (& git rev-parse HEAD).Trim()
$remote = (& git rev-parse origin/main).Trim()
if ($local -ne $remote) {
    Pop-Location
    throw "HEAD ($local) entspricht nicht origin/main ($remote). Erst pushen: git push origin main"
}
Pop-Location

$sha = $local
Write-Host "[*] HEAD = $sha"

# 2) Mod bauen (NACH dem Commit, damit gitHash korrekt eingebacken wird)
Push-Location $VencordDir
& pnpm build --standalone
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'pnpm build --standalone fehlgeschlagen' }
Pop-Location

# Verify: ist der aktuelle SHA in patcher.js drin?
$patcher = Join-Path $Dist 'patcher.js'
$shortSha = $sha.Substring(0, 7)
$ok = Select-String -Path $patcher -Pattern $shortSha -Quiet
if (-not $ok) {
    throw "patcher.js enthaelt $shortSha nicht. Build hat falschen gitHash eingebacken."
}
Write-Host "[OK] patcher.js enthaelt $shortSha"

# 3) SHA256SUMS erzeugen
$sumFile = Join-Path $Dist 'SHA256SUMS'
$lines = foreach ($f in 'patcher.js','preload.js','renderer.js','renderer.css') {
    $h = (Get-FileHash -Path (Join-Path $Dist $f) -Algorithm SHA256).Hash.ToLower()
    "$h  $f"
}
$lines | Out-File -FilePath $sumFile -Encoding ascii
Write-Host "[*] SHA256SUMS:"
Get-Content $sumFile | ForEach-Object { Write-Host "    $_" }

# 4) Tag setzen + pushen
Push-Location $Root
& git tag -a $Tag -m "$Tag ($sha)"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Tag $Tag konnte nicht gesetzt werden (existiert er schon?)" }
& git push origin $Tag
Pop-Location

# 5) Release auf GitHub anlegen MIT EXPLIZITER SHA als --target
if (-not $Title) { $Title = $Tag }
$releaseNotes = if ($Notes) { $Notes } else { "RagCord-Extend $Tag" }

$assets = @(
    (Join-Path $Dist 'patcher.js'),
    (Join-Path $Dist 'preload.js'),
    (Join-Path $Dist 'renderer.js'),
    (Join-Path $Dist 'renderer.css'),
    $sumFile
)

& gh release create $Tag `
    --repo $Repo `
    --title $Title `
    --notes $releaseNotes `
    --target $sha `
    @assets

if ($LASTEXITCODE -ne 0) { throw 'gh release create fehlgeschlagen' }

Write-Host ''
Write-Host '====================================================='
Write-Host "  Release $Tag live: https://github.com/$Repo/releases/tag/$Tag"
Write-Host "  target_commitish: $sha"
Write-Host '====================================================='
