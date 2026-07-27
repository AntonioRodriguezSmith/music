#Requires -Version 5.1
<#
.SYNOPSIS
  Launch Clip Harbour with a centered splash (large icon + progress), no console window.

  Prefers a standalone release .exe (no Cursor / Vite). Falls back to tauri dev.
  Set CLIP_HARBOUR_FORCE_DEV=1 to always use tauri dev.
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
$devLogFile = Join-Path $env:TEMP "clip-harbour-dev.log"
$devScript = Join-Path $root "dev-windows.ps1"
$forceDev = ($env:CLIP_HARBOUR_FORCE_DEV -eq "1")

function Write-LaunchLog([string]$text) {
  try {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $text"
    Add-Content -Path $logFile -Value $line -Encoding utf8 -ErrorAction SilentlyContinue
  } catch { }
}

function Test-ViteReady {
  try {
    $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:1420/")
    $req.Method = "GET"
    $req.Timeout = 800
    $req.ReadWriteTimeout = 800
    $resp = $req.GetResponse()
    $resp.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-StandaloneReleaseExe {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "clip_harbour-target\release\clip_harbour.exe"),
    (Join-Path $root "src-tauri\target\release\clip_harbour.exe")
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  return $null
}

function Test-IsReleasePath([string]$path) {
  if (-not $path) { return $false }
  return ($path -like "*\release\clip_harbour.exe")
}

function Test-IsDebugPath([string]$path) {
  if (-not $path) { return $false }
  return ($path -like "*\debug\clip_harbour.exe")
}

function Get-ClipHarbourProcess {
  # Exact name only - never match InterLocu / other node apps.
  Get-Process -Name "clip_harbour" -ErrorAction SilentlyContinue |
    Where-Object {
      if ($_.MainWindowHandle -eq [IntPtr]::Zero) { return $false }
      if (-not $_.Path) { return $true }
      return ($_.Path -like "*clip_harbour*" -or $_.Path -like "*clip-harbour*")
    }
}

function Stop-StaleDebugProcesses {
  Get-Process -Name "clip_harbour" -ErrorAction SilentlyContinue |
    Where-Object { Test-IsDebugPath $_.Path } |
    ForEach-Object {
      Write-LaunchLog "Stopping stale debug clip_harbour pid=$($_.Id) (Vite down or standalone preferred)"
      try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
}

function Show-ExistingWindow {
  $proc = Get-ClipHarbourProcess | Select-Object -First 1
  if (-not $proc) { return $false }

  $path = $proc.Path
  $isRelease = Test-IsReleasePath $path
  $isDebug = Test-IsDebugPath $path

  # Debug builds need the Vite server. If Cursor/terminal closed, Vite dies and the
  # window is a zombie - do not "focus" it; restart instead.
  if ($isDebug -and -not (Test-ViteReady)) {
    Write-LaunchLog "Existing debug pid=$($proc.Id) but Vite not on :1420 - restarting"
    Stop-StaleDebugProcesses
    return $false
  }

  # Prefer bringing a healthy release (or live debug+Vite) window to front.
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
  Write-LaunchLog "Focused existing clip_harbour pid=$($proc.Id) path=$path release=$isRelease debug=$isDebug"
  return $true
}

try {
  Set-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') launcher start root=$root forceDev=$forceDev" -Encoding utf8
} catch { }

if (Show-ExistingWindow) { exit 0 }

$releaseExe = $null
if (-not $forceDev) {
  $releaseExe = Get-StandaloneReleaseExe
}

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

$child = $null
$launchMode = "dev"

if ($releaseExe) {
  # Standalone: no npm / Vite / Cursor required.
  Stop-StaleDebugProcesses
  Write-LaunchLog "Starting standalone release: $releaseExe"
  $child = Start-Process -FilePath $releaseExe -WorkingDirectory (Split-Path $releaseExe -Parent) -PassThru
  $launchMode = "release"
  Write-LaunchLog "Release pid=$($child.Id)"
} else {
  if (-not (Test-Path -LiteralPath $devScript)) {
    Write-LaunchLog "Missing release exe and missing $devScript"
    [System.Windows.Forms.MessageBox]::Show(
      "No hay build standalone ni dev-windows.ps1.`r`n`r`nCompila una vez:`r`nnpm run tauri -- build`r`n`r`nO abre el proyecto y ejecuta:`r`nnpm run tauri -- dev",
      "Clip Harbour",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
  }

  # Log tauri/npm output so failures without Cursor are diagnosable.
  try {
    Set-Content -Path $devLogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') starting $devScript" -Encoding utf8
  } catch { }

  # Detached hidden PowerShell; tee output to temp log (do not redirect Start-Process
  # pipes - that can kill the tree when the splash exits).
  $argLine = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"& { `$ErrorActionPreference='Continue'; try { & '$devScript' *>&1 | Tee-Object -FilePath '$devLogFile' -Append } catch { `$_ | Out-File -FilePath '$devLogFile' -Append; exit 1 }; exit `$LASTEXITCODE }`""
  Write-LaunchLog "Starting detached via $psExe : $devScript (log=$devLogFile)"

  $child = Start-Process -FilePath $psExe `
    -ArgumentList $argLine `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru
  Write-LaunchLog "Child powershell pid=$($child.Id)"
}

if ($launchMode -eq "release") {
  $stages = @(
    @{ At = 0;  Text = "Abriendo Clip Harbour..." },
    @{ At = 3;  Text = "Casi listo..." }
  )
  $maxSeconds = 60
  $quietExitGraceSeconds = 15
} else {
  $stages = @(
    @{ At = 0;    Text = "Preparando entorno..." },
    @{ At = 8;    Text = "Cargando herramientas..." },
    @{ At = 20;   Text = "Compilando Clip Harbour..." },
    @{ At = 55;   Text = "Abriendo la interfaz..." },
    @{ At = 90;   Text = "Casi listo..." }
  )
  $maxSeconds = 600
  $quietExitGraceSeconds = 45
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$done = $false
$failed = $false

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
    if ($code -ne 0) {
      Write-LaunchLog "Child exited code=$code mode=$launchMode"
      $script:failed = $true
      $timer.Stop()
      $form.Close()
      return
    }
    if ($sec -ge $quietExitGraceSeconds) {
      Write-LaunchLog "Child exited 0 with no clip_harbour window after ${quietExitGraceSeconds}s mode=$launchMode"
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
  try { Write-LaunchLog "splash closed done=$done failed=$failed mode=$launchMode" } catch { }
})

[void]$form.ShowDialog()

if ($failed) {
  $hint = if ($launchMode -eq "release") {
    "O ejecuta el .exe:`r`n$releaseExe"
  } else {
    "O ejecuta en una terminal:`r`nnpm run tauri -- build`r`n(despues el acceso directo usara el .exe sin Cursor)`r`n`r`nDev log: $devLogFile"
  }
  $msg = "No se pudo iniciar Clip Harbour.`r`n`r`nRevisa el registro:`r`n$logFile`r`n`r`n$hint"
  [System.Windows.Forms.MessageBox]::Show(
    $msg,
    "Clip Harbour",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
  exit 1
}

exit 0
