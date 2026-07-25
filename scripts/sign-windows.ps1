# Optional Authenticode signing for MSI/NSIS artifacts.
# Skips with exit 0 when no cert env is configured (Fase 2 default).
#
# Env (either):
#   CLIP_HARBOUR_CERT_THUMBPRINT  — cert thumbprint in CurrentUser\My
#   CLIP_HARBOUR_PFX_PATH         — path to .pfx (+ CLIP_HARBOUR_PFX_PASSWORD)
#
# Usage:
#   .\scripts\sign-windows.ps1
#   .\scripts\sign-windows.ps1 -ArtifactDir "src-tauri\target\release\bundle"

param(
  [string]$ArtifactDir = "src-tauri\target\release\bundle"
)

$ErrorActionPreference = "Stop"
$thumb = $env:CLIP_HARBOUR_CERT_THUMBPRINT
$pfx = $env:CLIP_HARBOUR_PFX_PATH
$pfxPass = $env:CLIP_HARBOUR_PFX_PASSWORD

if (-not $thumb -and -not $pfx) {
  Write-Host "sign-windows: no CLIP_HARBOUR_CERT_THUMBPRINT or CLIP_HARBOUR_PFX_PATH - skip (exit 0)."
  exit 0
}

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
  $kits = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe"
  )
  $found = Get-Item $kits -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $found) {
    Write-Error "signtool.exe not found. Install Windows SDK or add signtool to PATH."
  }
  $signtoolPath = $found.FullName
} else {
  $signtoolPath = $signtool.Source
}

$files = @()
if (Test-Path $ArtifactDir) {
  $files += Get-ChildItem -Path $ArtifactDir -Recurse -Include *.msi, *.exe -File -ErrorAction SilentlyContinue
}

if ($files.Count -eq 0) {
  Write-Host "sign-windows: no MSI/EXE under $ArtifactDir - nothing to sign."
  exit 0
}

foreach ($file in $files) {
  Write-Host "Signing $($file.FullName)..."
  if ($pfx) {
    & $signtoolPath sign /fd SHA256 /f $pfx /p $pfxPass /tr http://timestamp.digicert.com /td SHA256 $file.FullName
  } else {
    & $signtoolPath sign /fd SHA256 /sha1 $thumb /tr http://timestamp.digicert.com /td SHA256 $file.FullName
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Error "signtool failed for $($file.FullName) (exit $LASTEXITCODE)"
  }
}

Write-Host "sign-windows: done."
