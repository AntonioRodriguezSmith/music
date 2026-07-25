#Requires -Version 5.1
<#
.SYNOPSIS
  Launch Clip Harbour with a centered splash (large icon + progress), no console window.
#>
$ErrorActionPreference = "Stop"

# WinForms needs STA
if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne "STA") {
  $arg = @(
    "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass",
    "-WindowStyle", "Hidden",
    "-File", "`"$PSCommandPath`""
  )
  Start-Process -FilePath "powershell.exe" -ArgumentList $arg -WindowStyle Hidden | Out-Null
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

function Get-ClipHarbourProcess {
  Get-Process -Name "clip_harbour*" -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }
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
  return $true
}

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

# Start Tauri / app in a hidden PowerShell child
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "powershell.exe"
$startInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$devScript`""
$startInfo.WorkingDirectory = $root
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$startInfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8

$child = New-Object System.Diagnostics.Process
$child.StartInfo = $startInfo
$null = $child.Start()

# Async log drain (avoid pipe fill)
$logSb = New-Object System.Text.StringBuilder
$child.add_OutputDataReceived({
  param($s, $e)
  if ($e.Data) { [void]$logSb.AppendLine($e.Data) }
})
$child.add_ErrorDataReceived({
  param($s, $e)
  if ($e.Data) { [void]$logSb.AppendLine($e.Data) }
})
$child.BeginOutputReadLine()
$child.BeginErrorReadLine()

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

  if ($child.HasExited -and -not (Get-ClipHarbourProcess)) {
    # Give a short grace period: tauri may spawn then exit the wrapper
    if ($sec -gt 15 -and $child.ExitCode -ne 0) {
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
  try { [System.IO.File]::WriteAllText($logFile, $logSb.ToString()) } catch { }
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
