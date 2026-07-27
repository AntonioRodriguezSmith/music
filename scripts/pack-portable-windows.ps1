#Requires -Version 5.1
<#
.SYNOPSIS
  Pack release clip_harbour.exe + yt-dlp/ffmpeg sidecars into a portable ZIP.
#>
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. (Join-Path $PSScriptRoot "setup-windows-env.ps1")

$target = $env:CARGO_TARGET_DIR
if (-not $target) {
  $target = Join-Path $env:LOCALAPPDATA "clip_harbour-target"
}
$exe = Join-Path $target "release\clip_harbour.exe"
if (-not (Test-Path -LiteralPath $exe)) {
  Write-Error "Missing $exe. Run: npm run tauri -- build"
}

$yt = Join-Path $root "src-tauri\binaries\yt-dlp-x86_64-pc-windows-msvc.exe"
$ff = Join-Path $root "src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path -LiteralPath $yt) -or -not (Test-Path -LiteralPath $ff)) {
  Write-Error "Missing sidecars. Run: npm run fetch:sidecars:windows"
}

$outDir = Join-Path $target "release\bundle\portable"
$stage = Join-Path $outDir "_stage"
$zipPath = Join-Path $outDir "clip_harbour-portable-win64.zip"

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Copy-Item -LiteralPath $exe -Destination (Join-Path $stage "clip_harbour.exe")
Copy-Item -LiteralPath $yt -Destination (Join-Path $stage "yt-dlp.exe")
Copy-Item -LiteralPath $ff -Destination (Join-Path $stage "ffmpeg.exe")

$readme = @"
Clip Harbour — portable (Windows x64)

1. Keep clip_harbour.exe, yt-dlp.exe and ffmpeg.exe in the same folder.
2. Double-click clip_harbour.exe (WebView2 required).
3. Set download folder and cookies.txt in the sidebar.

Desktop splash launcher (dev tree): npm run install:shortcut:windows
Docs: https://github.com/AntonioRodriguezSmith/music
"@
Set-Content -Path (Join-Path $stage "README.txt") -Value $readme -Encoding utf8

if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $stage

Write-Host "Portable ZIP: $zipPath"
Get-Item $zipPath | Format-List FullName, Length, LastWriteTime
