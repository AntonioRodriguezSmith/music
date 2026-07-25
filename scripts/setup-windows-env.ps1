# Shared Windows env for Clip Harbour (cargo PATH, MSVC, CARGO_TARGET_DIR).
# Dot-source: . "$PSScriptRoot\setup-windows-env.ps1"

$ErrorActionPreference = "Stop"

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (-not (Test-Path (Join-Path $cargoBin "cargo.exe"))) {
    Write-Error "cargo.exe not found in $cargoBin. Install Rust from https://rustup.rs and reopen the terminal."
}

# Prepend cargo; rebuild PATH from Machine+User so IDE terminals without rustup still work
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$cargoBin;$machinePath;$userPath"

if (-not $env:CARGO_HOME) {
    $env:CARGO_HOME = Join-Path $env:USERPROFILE ".cargo"
}
if (-not $env:RUSTUP_HOME) {
    $env:RUSTUP_HOME = Join-Path $env:USERPROFILE ".rustup"
}
if (-not $env:CARGO_TARGET_DIR) {
    $env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA "clip_harbour-target"
}

$vcvarsCandidates = @(
    (Join-Path $env:LOCALAPPDATA "msvcup\toolchain\vcvars-x64.bat"),
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2026\Community\VC\Auxiliary\Build\vcvars64.bat"
)

# Prefer vswhere (GitHub Actions / VS Installer) so CI picks Enterprise/BuildTools correctly
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $installPath = & $vswhere -latest -products * `
        -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        -property installationPath 2>$null |
        Select-Object -First 1
    if ($installPath) {
        $fromVswhere = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
        if (Test-Path $fromVswhere) {
            $vcvarsCandidates = @($fromVswhere) + $vcvarsCandidates
        }
    }
}

$vcvars = $vcvarsCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $vcvars) {
    Write-Error "MSVC not found. Install 'Desktop development with C++' (VS) or Build Tools, then re-run."
}

cmd /c "`"$vcvars`" && set" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}

# Prefer full system Windows SDK headers when available
$sdkRoot = "C:\Program Files (x86)\Windows Kits\10\Include"
if (Test-Path $sdkRoot) {
    $ver = Get-ChildItem $sdkRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
    if ($ver) {
        $shared = Join-Path $ver.FullName "shared"
        $um = Join-Path $ver.FullName "um"
        $ucrt = Join-Path $ver.FullName "ucrt"
        $env:INCLUDE = "$shared;$um;$ucrt;$env:INCLUDE"
        Write-Host "Using Windows SDK $($ver.Name)"
    }
}

Write-Host "cargo: $(& cargo --version)"
Write-Host "CARGO_TARGET_DIR=$env:CARGO_TARGET_DIR"
Write-Host "MSVC: $vcvars"
if ($env:CLIP_HARBOUR_COOKIES) { Write-Host "CLIP_HARBOUR_COOKIES=$env:CLIP_HARBOUR_COOKIES" }
if ($env:CLIP_HARBOUR_COOKIES_FROM_BROWSER) { Write-Host "CLIP_HARBOUR_COOKIES_FROM_BROWSER=$env:CLIP_HARBOUR_COOKIES_FROM_BROWSER" }
