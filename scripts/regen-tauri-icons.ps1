#Requires -Version 5.1
<#
.SYNOPSIS
  Regenerate src-tauri/icons from assets/clip-harbour-app-icon.png (+ .ico).
#>
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$srcPng = Join-Path $root "assets\clip-harbour-app-icon.png"
$srcIco = Join-Path $root "assets\clip-harbour-app-icon.ico"
$icons = Join-Path $root "src-tauri\icons"

if (-not (Test-Path -LiteralPath $srcPng)) {
  Write-Error "Missing $srcPng"
}

function Save-ResizedPng([string]$dest, [int]$size) {
  $img = [System.Drawing.Image]::FromFile($srcPng)
  try {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($img, 0, 0, $size, $size)
      } finally { $g.Dispose() }
      $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bmp.Dispose() }
  } finally { $img.Dispose() }
}

Save-ResizedPng (Join-Path $icons "32x32.png") 32
Save-ResizedPng (Join-Path $icons "128x128.png") 128
Save-ResizedPng (Join-Path $icons "128x128@2x.png") 256
Save-ResizedPng (Join-Path $icons "icon.png") 512

if (Test-Path -LiteralPath $srcIco) {
  Copy-Item -Force -LiteralPath $srcIco -Destination (Join-Path $icons "icon.ico")
}

$dup = Join-Path $icons "clip-harbour-launcher.ico"
if (Test-Path -LiteralPath $dup) {
  Remove-Item -Force -LiteralPath $dup
  Write-Host "Removed duplicate $dup"
}

Write-Host "Icons refreshed under $icons"
