# Clip Harbour - Windows development launcher (Tauri 2)
# Opens a native desktop window — do NOT use the browser on :1420 for invoke/IPC.
#
# Prerequisites: Node.js, Rust (rustup), MSVC toolchain via msvcup (no Visual Studio needed), WebView2
# Sidecars: run .\scripts\fetch-windows-sidecars.ps1 once

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

. (Join-Path $root "scripts\setup-windows-env.ps1")

$yt = Join-Path $root "src-tauri\binaries\yt-dlp-x86_64-pc-windows-msvc.exe"
$ff = Join-Path $root "src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path $yt) -or -not (Test-Path $ff)) {
    Write-Warning "Windows sidecars missing. Run: npm run fetch:sidecars:windows"
}

Write-Host "Starting Tauri desktop app..."
& (Join-Path $root "scripts\tauri-windows.ps1") dev
exit $LASTEXITCODE
