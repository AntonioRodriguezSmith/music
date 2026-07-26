#Requires -Version 5.1
<#
.SYNOPSIS
  Launch Clip Harbour with a centered splash (large icon + progress), no console window.
#>
$ErrorActionPreference = "Stop"

# Prefer System32 Windows PowerShell (Explorer/wscript often hit the WindowsApps stub).
$psExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path -LiteralPath $psExe)) { $psExe = "powershell.exe" }

# WinForms needs STA. Quote -File path (repo may live under "Proton Drive").
if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne "STA") {
  $argLine = "-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
  Start-Process -FilePath $psExe -ArgumentList $argLine -WindowStyle Hidden | Out-Null
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$root = Split-Path $PSScriptRoot -Parent
$iconPng = Join-Path $root "assets\clip-harbour-app-icon.png"
$iconIco = Join-Path $root "assets\clip-harbour-app-icon.ico"
$logFile = Join-Path $env:TEMP "clip-harbour-launch.log"
$devScript = Join-Path $root "dev-windows.ps1"

function Write-LaunchLog([string]$text) {
  try {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $text"
    Add-Content -Path $logFile -Value $line -Encoding utf8 -ErrorAction SilentlyContinue
  } catch { }
}

function Get-ClipHarbourProcess {
  # Exact name only — never match InterLocu / other node apps.
  # Path may be empty under some ACLs; prefer path match when available.
  Get-Process -Name "clip_harbour" -ErrorAction SilentlyContinue |
    Where-Object {
      if ($_.MainWindowHandle -eq [IntPtr]::Zero) { return $false }
      if (-not $_.Path) { return $true }
      return ($_.Path -like "*clip_harbour*" -or $_.Path -like "*clip-harbour*")
    }
}

function Show-ExistingWindow {
  $proc = Get-ClipHarbourProcess | Select-Object -First 1
  if (-not $proc) { return $false }
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@ -ErrorAction SilentlyContinue
  [void][NativeFocus]::ShowWindowAsync($proc.MainWindowHandle, 9) # SW_RESTORE
  [void][NativeFocus]::SetForegroundWindow($proc.MainWindowHandle)
  Write-LaunchLog "Focused existing clip_harbour pid=$($proc.Id) path=$($proc.Path)"
  return $true
}

try {
  Set-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') launcher start root=$root" -Encoding utf8
} catch { }

if (Show-ExistingWindow) { exit 0 }

# --- Splash UI ---
$form = New-Object System.Windows.Forms.Form
$form.Text = "Clip Harbour"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Size = New-Object System.Drawing.Size(440, 520)
$form.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 12)
$form.TopMost = $true
$form.ShowInTaskbar = $true
if (Test-Path $iconIco) {
  try { $form.Icon = New-Object System.Drawing.Icon($iconIco) } catch { }
}

# Soft rounded region
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 28
$w = $form.Width
$h = $form.Height
$path.AddArc(0, 0, $r, $r, 180, 90)
$path.AddArc($w - $r, 0, $r, $r, 270, 90)
$path.AddArc($w - $r, $h - $r, $r, $r, 0, 90)
$path.AddArc(0, $h - $r, $r, $r, 90, 90)
$path.CloseFigure()
$form.Region = New-Object System.Drawing.Region($path)

$picture = New-Object System.Windows.Forms.PictureBox
$picture.Size = New-Object System.Drawing.Size(260, 260)
$picture.Location = New-Object System.Drawing.Point([int](($form.Width - 260) / 2), 56)
$picture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
$picture.BackColor = [System.Drawing.Color]::Transparent
if (Test-Path $iconPng) {
  $picture.Image = [System.Drawing.Image]::FromFile($iconPng)
}

$title = New-Object System.Windows.Forms.Label
$title.Text = "Clip Harbour"
$title.ForeColor = [System.Drawing.Color]::White
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 18, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $false
$title.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$title.Size = New-Object System.Drawing.Size($form.Width, 36)
$title.Location = New-Object System.Drawing.Point(0, 330)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Iniciando..."
$status.ForeColor = [System.Drawing.Color]::FromArgb(170, 170, 175)
$status.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$status.AutoSize = $false
$status.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$status.Size = New-Object System.Drawing.Size($form.Width, 28)
$status.Location = New-Object System.Drawing.Point(0, 372)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
$progress.MarqueeAnimationSpeed = 25
$progress.Size = New-Object System.Drawing.Size(280, 8)
$progress.Location = New-Object System.Drawing.Point([int](($form.Width - 280) / 2), 420)

$form.Controls.AddRange(@($picture, $title, $status, $progress))

if (-not (Test-Path -LiteralPath $devScript)) {
  Write-LaunchLog "Missing $devScript"
  [System.Windows.Forms.MessageBox]::Show(
    "No se encontro dev-windows.ps1 en:`r`n$devScript",
    "Clip Harbour",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  exit 1
}

# Start Tauri in a detached hidden PowerShell so closing the splash does not
# kill npm/cargo/clip_harbour (redirected pipes would keep the child attached).
$argLine = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$devScript`""
Write-LaunchLog "Starting detached via $psExe : $devScript"

$child = Start-Process -FilePath $psExe `
  -ArgumentList $argLine `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru
Write-LaunchLog "Child powershell pid=$($child.Id)"

$stages = @(
  @{ At = 0;    Text = "Preparando entorno..." },
  @{ At = 8;    Text = "Cargando herramientas..." },
  @{ At = 20;   Text = "Compilando Clip Harbour..." },
  @{ At = 55;   Text = "Abriendo la interfaz..." },
  @{ At = 90;   Text = "Casi listo..." }
)
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$done = $false
$failed = $false
$maxSeconds = 600
# If the wrapper exits successfully but no window appears, fail sooner than maxSeconds.
$quietExitGraceSeconds = 45

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 250
$timer.Add_Tick({
  $sec = [int]$sw.Elapsed.TotalSeconds

  foreach ($stage in ($stages | Sort-Object At -Descending)) {
    if ($sec -ge $stage.At) {
      if ($status.Text -ne $stage.Text) { $status.Text = $stage.Text }
      break
    }
  }

  if (Get-ClipHarbourProcess) {
    $script:done = $true
    $status.Text = "Listo"
    $timer.Stop()
    $form.Close()
    return
  }

  if ($child -and $child.HasExited -and -not (Get-ClipHarbourProcess)) {
    $code = $child.ExitCode
    # Fail-fast on any non-zero exit (do not wait 15s).
    if ($code -ne 0) {
      Write-LaunchLog "Child exited code=$code"
      $script:failed = $true
      $timer.Stop()
      $form.Close()
      return
    }
    # Exit 0 but no window: wrapper finished without launching UI.
    if ($sec -ge $quietExitGraceSeconds) {
      Write-LaunchLog "Child exited 0 with no clip_harbour window after ${quietExitGraceSeconds}s"
      $script:failed = $true
      $timer.Stop()
      $form.Close()
      return
    }
  }

  if ($sec -ge $maxSeconds) {
    $script:failed = $true
    $status.Text = "Tiempo de espera agotado"
    $timer.Stop()
    $form.Close()
  }
})

$form.Add_Shown({ $timer.Start() })
$form.Add_FormClosed({
  $timer.Stop()
  try { Write-LaunchLog "splash closed done=$done failed=$failed" } catch { }
})

[void]$form.ShowDialog()

if ($failed) {
  $msg = "No se pudo iniciar Clip Harbour.`r`n`r`nRevisa el registro:`r`n$logFile`r`n`r`nO ejecuta en una terminal:`r`nnpm run tauri -- dev"
  [System.Windows.Forms.MessageBox]::Show(
    $msg,
    "Clip Harbour",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  exit 1
}

exit 0
