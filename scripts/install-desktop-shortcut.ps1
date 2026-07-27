#Requires -Version 5.1
<#
.SYNOPSIS
  Create/update Desktop shortcut "Clip Harbour" → splash VBS launcher.
#>
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Clip Harbour.lnk"
$vbs = Join-Path $root "scripts\launch-clip-harbour.vbs"
$ico = Join-Path $root "assets\clip-harbour-app-icon.ico"

if (-not (Test-Path -LiteralPath $vbs)) {
  Write-Error "Missing $vbs"
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnkPath)
$sc.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
$sc.Arguments = "//nologo `"$vbs`""
$sc.WorkingDirectory = $root
if (Test-Path -LiteralPath $ico) {
  $sc.IconLocation = "$ico,0"
}
$sc.Description = "Clip Harbour - splash + ventana nativa (sin consola)"
$sc.Save()

Write-Host "Shortcut: $lnkPath"
Write-Host "Target: wscript.exe //nologo $vbs"
