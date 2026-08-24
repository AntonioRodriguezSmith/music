# test-download.ps1: integración real de descarga (yt-dlp + ffmpeg) con los
# mismos args que usa la app. OPT-IN: requiere red y puede fallar si YouTube
# bloquea. Uso: npm run test:download
param(
    [string]$Url = "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$setup = Join-Path $root "scripts\setup-windows-env.ps1"
if (Test-Path $setup) { . $setup }

if (-not $OutDir) {
    $OutDir = Join-Path $env:TEMP "clip_harbour-test-download"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Remove-Item "$OutDir\*" -Force -ErrorAction SilentlyContinue

$yt = Join-Path $root "src-tauri\binaries\yt-dlp-x86_64-pc-windows-msvc.exe"
$ff = Join-Path $root "src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path $yt)) { Write-Error "Falta yt-dlp sidecar: npm run fetch:sidecars:windows" }
if (-not (Test-Path $ff)) { Write-Error "Falta ffmpeg sidecar: npm run fetch:sidecars:windows" }

Write-Host "=== test-download ==="
Write-Host "URL: $Url"
Write-Host "Out: $OutDir"

# 1) Descarga de audio corta (primeros 10s) con los mismos args de la app.
$args = @(
    $Url,
    "--newline", "--progress", "--no-playlist",
    "-f", "bestaudio/best",
    "--download-sections", "*0-10",
    "-o", "test.%(ext)s",
    "-P", $OutDir
)
Write-Host "--- yt-dlp ---"
$out = & $yt @args 2>&1
$code = $LASTEXITCODE
$out | ForEach-Object { Write-Host $_ }
if ($code -ne 0) { Write-Error "yt-dlp falló (exit $code). Revisa red/cookies." }

$src = Get-ChildItem $OutDir -Filter "test.*" | Select-Object -First 1
if (-not $src -or $src.Length -eq 0) { Write-Error "No se produjo archivo de audio." }
Write-Host "[OK] descarga: $($src.Name) ($($src.Length) bytes)"

# 2) Conversión con ffmpeg (mismo patrón que convert_video: aac 256k).
$dst = Join-Path $OutDir "test.m4a"
Write-Host "--- ffmpeg ---"
$fout = & $ff -y -i $src.FullName -vn -c:a aac -b:a 256k -map_metadata 0 $dst 2>&1
if ($LASTEXITCODE -ne 0) { Write-Error "ffmpeg falló: $fout" }
$dstFile = Get-Item $dst
if (-not $dstFile -or $dstFile.Length -eq 0) { Write-Error "Conversión no produjo archivo." }
Write-Host "[OK] conversión: test.m4a ($($dstFile.Length) bytes)"

# 3) Limpieza del fuente (igual que remove_source_after_conversion).
Remove-Item $src.FullName -Force
Write-Host "[OK] fuente borrado tras conversión"

Write-Host ""
Write-Host "test-download passed." -ForegroundColor Green
exit 0
