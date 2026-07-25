# Run Tauri CLI with Windows cargo/MSVC PATH fixed (fixes "cargo metadata: program not found").
# Usage: npm run tauri -- dev
#        npm run tauri -- build

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

. (Join-Path $PSScriptRoot "setup-windows-env.ps1")

$tauriCmd = Join-Path $root "node_modules\.bin\tauri.cmd"
if (-not (Test-Path $tauriCmd)) {
    Write-Error "Tauri CLI missing. Run: npm install"
}

& $tauriCmd @args
exit $LASTEXITCODE
