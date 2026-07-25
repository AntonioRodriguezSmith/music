# Background cargo check (minimized window). Does not open tauri / splash.
# Usage: npm run check:rust:bg
# Writes PID + log path; does not wait for finish.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$checkScript = Join-Path $PSScriptRoot "cargo-check-windows.ps1"
$logPath = Join-Path $env:TEMP "clip-harbour-cargo-check.log"

$proc = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $checkScript
    ) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Minimized `
    -PassThru

Write-Host "cargo check started in background"
Write-Host "PID: $($proc.Id)"
Write-Host "Log: $logPath"
Write-Host "When done, the log ends with 'Finished exit=...'."
