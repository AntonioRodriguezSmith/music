# Download ffmpeg (arm64-v8a) for the Clip Harbour Android app.
#
# yt-dlp is NOT fetched here: there is no standalone Android build, so the
# mobile app embeds it via Chaquopy (CPython + yt-dlp in-process). Only ffmpeg
# ships as a native binary, packaged through the Android project's `jniLibs`
# directory (Tauri `externalBin` does not work on Android, see
# tauri-apps/tauri#9774). At runtime it lives in the app `nativeLibraryDir`
# as `libffmpeg.so` and is executed with `std::process::Command`.
#
# Usage:  npm run fetch:sidecars:android   (or run this script directly)

$ErrorActionPreference = "Stop"

# Prebuilt static ffmpeg/ffprobe for Android arm64-v8a (NDK r28, 16 KB pages).
# LGPL-2.1, no GPL: validate `-c:a libmp3lame` before relying on MP3 output.
$repo = "hzw1199/Android-FFmpeg-Prebuilt"
$versions = @("ffmpeg-8.1.1", "ffmpeg-8.0.1")

# Destination: jniLibs arm64-v8a, named `libffmpeg.so` so the Android package
# extracts it into `nativeLibraryDir` (see tauri-apps/tauri#9774 workaround).
$root = Split-Path $PSScriptRoot -Parent
$jniLibs = Join-Path $root "src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
$ffOut = Join-Path $jniLibs "libffmpeg.so"
New-Item -ItemType Directory -Force -Path $jniLibs | Out-Null

$tmp = Join-Path $env:TEMP "clip_harbour_ffmpeg_android"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Test-ElfAarch64([string]$path) {
    # ELF magic \x7fELF + e_machine = 0xB7 (EM_AARCH64) at offset 18.
    $bytes = [System.IO.File]::ReadAllBytes($path)
    if ($bytes.Length -lt 20) { return $false }
    if ($bytes[0] -ne 0x7F -or $bytes[1] -ne 0x45 -or $bytes[2] -ne 0x4C -or $bytes[3] -ne 0x46) { return $false }
    return ($bytes[18] -eq 0xB7 -and $bytes[19] -eq 0x00)
}

$downloaded = $false
foreach ($version in $versions) {
    $candidate = Join-Path $tmp $version
    if (-not (Test-Path $candidate)) {
        Write-Host "Downloading ffmpeg ($version)..."
        curl.exe -L --fail --silent --show-error `
            "https://raw.githubusercontent.com/$repo/main/$version/bin/ffmpeg" `
            -o $candidate
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $candidate)) {
            Write-Host "  $version not available, trying next..."
            continue
        }
    }
    if (-not (Test-ElfAarch64 $candidate)) {
        Write-Host "  $version is not an AArch64 ELF, trying next..."
        continue
    }
    Copy-Item $candidate $ffOut -Force
    $downloaded = $true
    Write-Host "OK: ffmpeg AArch64 from $version"
    break
}

if (-not $downloaded) {
    Write-Error "No usable ffmpeg arm64 found for $repo"
}

# Validate MP3 encoder (libmp3lame) presence, required by queue.rs for MP3
# output. LGPL builds usually include it; GPL is disabled upstream.
$lame = Select-String -Path $ffOut -Pattern "libmp3lame" -SimpleMatch -Quiet
if ($lame) {
    Write-Host "OK: libmp3lame (MP3) disponible en el binario."
} else {
    Write-Host "WARN: libmp3lame NO encontrado en el binario. MP3 fallará; usar m4a/aac."
}

Write-Host ""
Write-Host "Instalado:"
Write-Host "  $ffOut"
Write-Host ""
Write-Host "Nota: en el dispositivo este binario queda en nativeLibraryDir/libffmpeg.so"
Write-Host "y se ejecuta con std::process::Command (el plugin shell de Android solo hace open)."
