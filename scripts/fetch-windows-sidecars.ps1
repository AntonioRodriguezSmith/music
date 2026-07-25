# Download yt-dlp + ffmpeg for Tauri Windows sidecars (x86_64-pc-windows-msvc)
$ErrorActionPreference = "Stop"

$binDir = Join-Path (Split-Path $PSScriptRoot -Parent) "src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$ytOut = Join-Path $binDir "yt-dlp-x86_64-pc-windows-msvc.exe"
$ffOut = Join-Path $binDir "ffmpeg-x86_64-pc-windows-msvc.exe"

Write-Host "Downloading yt-dlp..."
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile $ytOut -UseBasicParsing

Write-Host "Downloading ffmpeg (essentials zip)..."
$tmp = Join-Path $env:TEMP "ffmpeg-essentials.zip"
$extract = Join-Path $env:TEMP "ffmpeg-essentials-extract"
Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $tmp -UseBasicParsing
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $tmp -DestinationPath $extract -Force
$ffmpegExe = Get-ChildItem $extract -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $ffmpegExe) { Write-Error "ffmpeg.exe not found inside essentials zip" }
Copy-Item $ffmpegExe.FullName $ffOut -Force

Write-Host "OK:"
Write-Host "  $ytOut"
Write-Host "  $ffOut"
