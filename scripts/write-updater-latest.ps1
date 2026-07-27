#Requires -Version 5.1
# Emit a Tauri updater latest.json stub next to release bundles (CI/local).
param(
  [string]$Version = "0.1.0",
  [string]$Notes = "Clip Harbour Windows release"
)

$ErrorActionPreference = "Stop"

$target = $env:CARGO_TARGET_DIR
if (-not $target -or ($target -like "*cursor-sandbox*")) {
  $target = Join-Path $env:LOCALAPPDATA "clip_harbour-target"
}

$nsisDir = Join-Path $target "release\bundle\nsis"
$msiDir = Join-Path $target "release\bundle\msi"
$nsis = $null
$msi = $null
if (Test-Path -LiteralPath $nsisDir) {
  $nsis = Get-ChildItem -LiteralPath $nsisDir -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (Test-Path -LiteralPath $msiDir) {
  $msi = Get-ChildItem -LiteralPath $msiDir -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
}

$platforms = @{}
if ($nsis) {
  $platforms["windows-x86_64"] = @{
    url = "https://github.com/AntonioRodriguezSmith/music/releases/latest/download/$($nsis.Name)"
    signature = ""
  }
} elseif ($msi) {
  $platforms["windows-x86_64"] = @{
    url = "https://github.com/AntonioRodriguezSmith/music/releases/latest/download/$($msi.Name)"
    signature = ""
  }
} else {
  Write-Warning "No NSIS/MSI under $target\release\bundle - writing empty platforms."
}

$payload = @{
  version = $Version
  notes = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString("o")
  platforms = $platforms
}

$outDir = Join-Path $target "release\bundle\updater"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outFile = Join-Path $outDir "latest.json"
$json = $payload | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $outFile -Value $json -Encoding utf8
Write-Host "Wrote $outFile"
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
  Write-Host "TAURI_SIGNING_PRIVATE_KEY not set - signatures empty; sign before publishing GitHub Release."
}
