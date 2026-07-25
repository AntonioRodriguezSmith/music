# Foreground cargo check for Clip Harbour (MSVC + CARGO_TARGET_DIR via setup-windows-env).
# Usage: npm run check:rust
# Optional log: %TEMP%\clip-harbour-cargo-check.log

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\setup-windows-env.ps1"

$repoRoot = Split-Path -Parent $PSScriptRoot
$tauriDir = Join-Path $repoRoot "src-tauri"
$logPath = Join-Path $env:TEMP "clip-harbour-cargo-check.log"

Set-Location $tauriDir

$startLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') cargo check starting (pid=$PID)"
Write-Host $startLine
Set-Content -Path $logPath -Value $startLine -Encoding utf8

# cargo writes progress to stderr; with $ErrorActionPreference=Stop that becomes terminating.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& cargo check 2>&1 | ForEach-Object {
    $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { "$_" }
    Write-Host $line
    Add-Content -Path $logPath -Value $line -Encoding utf8
}
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $prevEap

$endLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Finished exit=$exitCode"
Write-Host $endLine
Add-Content -Path $logPath -Value $endLine -Encoding utf8
Write-Host "Log: $logPath"

exit $exitCode
