# Muestra el estado de la app y el entorno de desarrollo.
# Uso: .\estado.ps1
#
# Todas las rutas se derivan del entorno actual para que funcione en cualquier PC.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$releaseDir = Join-Path $env:LOCALAPPDATA "clip_harbour-target\release"
$sidecarBin = Join-Path $repoRoot "src-tauri\binaries"

Write-Host "=== Proceso clip_harbour ===" -ForegroundColor Cyan
$proc = Get-Process clip_harbour -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc) {
    Write-Host "  PID: $($proc.Id)"
    Write-Host "  Ventana: '$($proc.MainWindowTitle)'"
    Write-Host "  Responding: $($proc.Responding)"
    Write-Host "  RAM: $([Math]::Round($proc.WorkingSet64/1MB,1)) MB"
} else {
    Write-Host "  NO corriendo" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Vite (puerto 1420) ===" -ForegroundColor Cyan
$conn = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        $np = Get-Process -Id $p -ErrorAction SilentlyContinue
        Write-Host "  Escuchando: PID $p ($($np.ProcessName))"
    }
} else {
    Write-Host "  Puerto 1420 libre" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Binarios release ($releaseDir) ===" -ForegroundColor Cyan
if (Test-Path "$releaseDir\clip_harbour.exe") {
    $f = Get-Item "$releaseDir\clip_harbour.exe"
    Write-Host "  clip_harbour.exe: $([Math]::Round($f.Length/1MB,1)) MB ($($f.LastWriteTime))"
} else {
    Write-Host "  No existe" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== MSVC toolchain ===" -ForegroundColor Cyan
$msvcupVcvars = "$env:LOCALAPPDATA\msvcup\toolchain22621\vcvars-x64.bat"
if (Test-Path $msvcupVcvars) {
    Write-Host "  msvcup (SDK 22621): OK"
} else {
    Write-Host "  msvcup toolchain22621: NO encontrado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Sidecars ($sidecarBin) ===" -ForegroundColor Cyan
foreach ($name in @("yt-dlp-x86_64-pc-windows-msvc.exe", "ffmpeg-x86_64-pc-windows-msvc.exe")) {
    $path = Join-Path $sidecarBin $name
    if (Test-Path $path) {
        $f = Get-Item $path
        Write-Host "  $name : $([Math]::Round($f.Length/1MB,1)) MB"
    } else {
        Write-Host "  $name : FALTA" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Cookies (env) ===" -ForegroundColor Cyan
if ($env:CLIP_HARBOUR_COOKIES) {
    Write-Host "  CLIP_HARBOUR_COOKIES: definida" -ForegroundColor Green
} else {
    Write-Host "  No definida" -ForegroundColor Yellow
}
