# Shared Windows env for Clip Harbour (cargo PATH, MSVC, CARGO_TARGET_DIR).
# Dot-source: . "$PSScriptRoot\setup-windows-env.ps1"

$ErrorActionPreference = "Stop"

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (-not (Test-Path (Join-Path $cargoBin "cargo.exe"))) {
    Write-Error "cargo.exe not found in $cargoBin. Install Rust from https://rustup.rs and reopen the terminal."
}

# Prepend cargo; rebuild PATH from Machine+User so Explorer / desktop shortcuts
# (and IDE terminals without rustup) still find cargo + node without Cursor open.
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$cargoBin;$machinePath;$userPath"

# Node is required for tauri/vite; ensure common install dirs even if User PATH is stale.
$nodeCandidates = @(
    "C:\Program Files\nodejs",
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs")
)
foreach ($nodeDir in $nodeCandidates) {
    if ($nodeDir -and (Test-Path (Join-Path $nodeDir "node.exe"))) {
        $env:Path = "$nodeDir;$env:Path"
        break
    }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node.exe not found on PATH. Install Node.js LTS from https://nodejs.org and reopen the terminal."
}

if (-not $env:CARGO_HOME) {
    $env:CARGO_HOME = Join-Path $env:USERPROFILE ".cargo"
}
if (-not $env:RUSTUP_HOME) {
    $env:RUSTUP_HOME = Join-Path $env:USERPROFILE ".rustup"
}
# Prefer LocalAppData; ignore Cursor agent sandbox targets so desktop/release
# builds land where the launcher expects them.
if (-not $env:CARGO_TARGET_DIR -or $env:CARGO_TARGET_DIR -match 'cursor-sandbox') {
    $env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA "clip_harbour-target"
}

# Prefer real Visual Studio / Build Tools MSVC; msvcup is last-resort fallback only.
# Build Tools usually lives under Program Files (x86).
$vcvarsCandidates = @(
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2026\Community\VC\Auxiliary\Build\vcvars64.bat",
    (Join-Path $env:LOCALAPPDATA "msvcup\toolchain\vcvars-x64.bat")
)

# Prefer vswhere (GitHub Actions / VS Installer). Use -all so a newer VS without
# C++ tools (e.g. Community 2026) does not hide Build Tools that do have MSVC.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $installPaths = & $vswhere -all -products * `
        -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        -property installationPath 2>$null
    foreach ($installPath in $installPaths) {
        if (-not $installPath) { continue }
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

# Load root .env into process (CLIP_HARBOUR_* / VITE_*). Does not override existing env.
$dotenv = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (Test-Path -LiteralPath $dotenv) {
    Get-Content -LiteralPath $dotenv | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        if ($key -notmatch '^(CLIP_HARBOUR_|VITE_)') { return }
        $cur = [System.Environment]::GetEnvironmentVariable($key, "Process")
        if (-not $cur) {
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
}

Write-Host "cargo: $(& cargo --version)"
Write-Host "CARGO_TARGET_DIR=$env:CARGO_TARGET_DIR"
Write-Host "MSVC: $vcvars"
if ($env:CLIP_HARBOUR_COOKIES) { Write-Host "CLIP_HARBOUR_COOKIES=$env:CLIP_HARBOUR_COOKIES" }
if ($env:CLIP_HARBOUR_COOKIES_FROM_BROWSER) { Write-Host "CLIP_HARBOUR_COOKIES_FROM_BROWSER=$env:CLIP_HARBOUR_COOKIES_FROM_BROWSER" }
