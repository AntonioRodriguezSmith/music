# Windows smoke checks: sidecars + unit tests (no full Tauri UI).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Prepend cargo so smoke can find it in IDE terminals
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
    $env:Path = "$cargoBin;" + $env:Path
}

# Optional YouTube cookies for smoke/manual yt-dlp (same env names as the app)
# $env:CLIP_HARBOUR_COOKIES = "C:\path\to\cookies.txt"
# $env:CLIP_HARBOUR_COOKIES_FROM_BROWSER = "firefox"

$failed = 0

function Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Fail($msg) {
    Write-Host "[FAIL] $msg" -ForegroundColor Red
    $script:failed++
}

Write-Host "=== Clip Harbour smoke (Windows) ==="

$yt = Join-Path $root "src-tauri\binaries\yt-dlp-x86_64-pc-windows-msvc.exe"
$ff = Join-Path $root "src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe"

if (Test-Path $yt) { Ok "yt-dlp sidecar present" } else { Fail "missing $yt — run npm run fetch:sidecars:windows" }
if (Test-Path $ff) { Ok "ffmpeg sidecar present" } else { Fail "missing $ff — run npm run fetch:sidecars:windows" }

if (Test-Path $yt) {
    $out = & $yt --version 2>&1
    if ($LASTEXITCODE -eq 0 -and "$out") { Ok "yt-dlp --version: $out" } else { Fail "yt-dlp --version failed: $out" }
}

if (Test-Path $ff) {
    $out = & $ff -version 2>&1 | Select-Object -First 1
    if ("$out" -match "ffmpeg") { Ok "ffmpeg -version: $out" } else { Fail "ffmpeg -version failed: $out" }
}

# URL resolve smoke (no npm needed if node available)
$nodeOk = $false
try {
    $null = Get-Command node -ErrorAction Stop
    $nodeOk = $true
} catch {}

if ($nodeOk) {
    Write-Host "Running unit tests (vitest)..."
    npm run test -- --run
    if ($LASTEXITCODE -eq 0) { Ok "vitest passed" } else { Fail "vitest failed" }
} else {
    Fail "node not on PATH"
}

# Rust unit tests (queue.rs, ytdlp.rs). Carga el entorno MSVC del repo.
$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
if (Test-Path $cargo) {
    $setup = Join-Path $root "scripts\setup-windows-env.ps1"
    if (Test-Path $setup) { . $setup }
    Push-Location (Join-Path $root "src-tauri")
    # cargo escribe a stderr incluso en éxito (p. ej. "Finished test profile");
    # con ErrorActionPreference=Stop ese 2>&1 lanza NativeCommandError y mata el smoke.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $cargo test --lib 2>&1 | Out-Host
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    Pop-Location
    if ($code -eq 0) { Ok "cargo test --lib passed" } else { Fail "cargo test --lib failed" }
} else {
    Fail "cargo not found at $cargo"
}

# Descarga real opcional (requiere red). Comentado por defecto para no depender
# de red en el smoke básico. Actívalo descomentando:
# npm run test:download

# Manual IPC reminder
Write-Host ""
Write-Host "Manual desktop smoke (not automated):"
Write-Host "  1. npm run dev:windows"
Write-Host "  2. Use the native window (not browser :1420)"
Write-Host "  3. Paste a YouTube URL -> formats load"
Write-Host "  4. Choose folder -> download one short clip"

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "Smoke finished with $failed failure(s)." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Smoke passed." -ForegroundColor Green
exit 0
