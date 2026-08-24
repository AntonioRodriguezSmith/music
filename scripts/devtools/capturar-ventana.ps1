# Captura la ventana de la app clip_harbour y la guarda como PNG en scripts\devtools\capturas.
# Uso:
#   .\capturar-ventana.ps1                    -> guarda capturas\clip_harbour-YYYYMMDD-HHmmss.png
#   .\capturar-ventana.ps1 -Out archivo.png   -> guarda en la ruta indicada

param(
    [string]$Out
)

$ErrorActionPreference = "Stop"

# DPI-aware: si no se declara, Windows "miente" sobre las coordenadas en
# pantallas con scaling >100% y la captura sale recortada.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DpiHelper {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[DpiHelper]::SetProcessDPIAware() | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CapWin {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$proc = Get-Process clip_harbour -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) {
    Write-Error "clip_harbour no esta corriendo. Lanza la app primero (npm run dev:windows o el exe release)."
}

$rect = New-Object CapWin+RECT
$ok = [CapWin]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
if (-not $ok) {
    Write-Error "No se pudo obtener la geometria de la ventana (GetWindowRect fallo)."
}
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) {
    Write-Error "No se pudo obtener la geometria de la ventana (¿minimizada?)."
}

if (-not $Out) {
    $dir = Join-Path $PSScriptRoot "capturas"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $Out = Join-Path $dir "clip_harbour-$(Get-Date -Format yyyyMMdd-HHmmss).png"
}
elseif (-not [System.IO.Path]::IsPathRooted($Out)) {
    $Out = Join-Path (Get-Location) $Out
}

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
try {
    $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Capturada ventana $($w)x$($h) en $Out"
}
finally {
    $g.Dispose()
    $bmp.Dispose()
}
