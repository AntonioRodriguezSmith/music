//! Self-contained sidecar binaries.
//!
//! yt-dlp and ffmpeg are embedded into the main executable so a single
//! `clip_harbour.exe` can run everything without moving companion files.
//! Binaries are extracted on first run to `%LOCALAPPDATA%\clip_harbour\bin`.
//!
//! Resolution order per binary (desktop / non-Android):
//!   1. Copy next to the current executable (portable layout, e.g. installed
//!      by the NSIS/MSI bundler).
//!   2. Dev layout (`yt-dlp-x86_64-pc-windows-msvc.exe` next to the exe).
//!   3. Embedded copy extracted to the app data dir.
//!
//! On Android there are no embedded binaries (the Windows `.exe` bytes would
//! never run there) and Tauri `externalBin` is not supported
//! (tauri-apps/tauri#9774). The dual [`resolve`] API returns a filesystem path
//! on desktop and a Tauri sidecar name on Android; ffmpeg is packaged via the
//! Android project's `jniLibs` and yt-dlp runs in-process via Chaquopy.

#[cfg(not(target_os = "android"))]
use std::path::Path;
use std::path::PathBuf;

use tauri_plugin_shell::process::Command;
use tauri_plugin_shell::ShellExt;

// ---------------------------------------------------------------------------
// Desktop / non-Android sidecars (embedded bytes + extraction)
// ---------------------------------------------------------------------------
// Android has no embedded binaries: the Windows `.exe` constants below would
// never run there. ffmpeg is packaged through the Android project's `jniLibs`
// and yt-dlp runs in-process via Chaquopy (see docs/MOBILE_SPIKE.md), so the
// whole extract-to-`%LOCALAPPDATA%` machinery is compiled out on Android.

#[cfg(all(not(target_os = "android"), target_os = "windows"))]
const YTDLP_BYTES: &[u8] =
    include_bytes!("../binaries/yt-dlp-x86_64-pc-windows-msvc.exe");
#[cfg(all(not(target_os = "android"), target_os = "windows"))]
const FFMPEG_BYTES: &[u8] =
    include_bytes!("../binaries/ffmpeg-x86_64-pc-windows-msvc.exe");

#[cfg(all(not(target_os = "android"), not(target_os = "windows")))]
const YTDLP_BYTES: &[u8] = b"";
#[cfg(all(not(target_os = "android"), not(target_os = "windows")))]
const FFMPEG_BYTES: &[u8] = b"";

#[cfg(not(target_os = "android"))]
const TRIPLE: &str = "x86_64-pc-windows-msvc";

#[cfg(not(target_os = "android"))]
fn file_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

/// Directory where embedded binaries are extracted on first run.
#[cfg(not(target_os = "android"))]
pub fn extracted_dir() -> Result<PathBuf, String> {
    if let Some(appdata) = std::env::var_os("LOCALAPPDATA") {
        return Ok(PathBuf::from(appdata).join("clip_harbour").join("bin"));
    }
    if let Some(home) = std::env::var_os("HOME") {
        return Ok(PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("clip_harbour")
            .join("bin"));
    }
    Err("No se pudo localizar el directorio de datos de la app".to_string())
}

#[cfg(not(target_os = "android"))]
fn write_if_changed(dir: &Path, name: &str, bytes: &[u8]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    let path = dir.join(name);
    let is_stale = path
        .metadata()
        .map(|m| m.len() as usize != bytes.len())
        .unwrap_or(true);
    if is_stale {
        std::fs::write(&path, bytes).map_err(|e| format!("write {path:?}: {e}"))?;
    }
    Ok(())
}

/// Extract the embedded binaries if missing or outdated. Returns the bin dir.
/// Called once from the Tauri `setup` hook so failures surface at startup.
/// Skipped on Android: embedded Windows binaries do not run there and the
/// mobile flow resolves ffmpeg/yt-dlp through [`Bin`].
#[cfg(not(target_os = "android"))]
pub fn ensure() -> Result<PathBuf, String> {
    let dir = extracted_dir()?;
    write_if_changed(&dir, &file_name("yt-dlp"), YTDLP_BYTES)?;
    write_if_changed(&dir, &file_name("ffmpeg"), FFMPEG_BYTES)?;
    Ok(dir)
}

/// Resolve the runnable path for a binary (`yt-dlp` / `ffmpeg`), preferring a
/// local copy over the embedded one so the portable layout keeps working.
#[cfg(not(target_os = "android"))]
fn resolve_path(base: &str) -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    if let Some(dir) = exe_dir {
        let local = dir.join(file_name(base));
        if local.is_file() {
            return Ok(local);
        }
        let dev = dir.join(format!("{base}-{TRIPLE}"));
        if dev.is_file() {
            return Ok(dev);
        }
    }
    Ok(ensure()?.join(file_name(base)))
}

// ---------------------------------------------------------------------------
// Dual resolution API (desktop path / Android sidecar name)
// ---------------------------------------------------------------------------

/// Tauri sidecar name for `base` on the current Android ABI, e.g.
/// `bin/yt-dlp-aarch64-linux-android`.
#[cfg(target_os = "android")]
fn android_sidecar(base: &str) -> String {
    let triple = if cfg!(target_arch = "aarch64") {
        "aarch64-linux-android"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64-linux-android"
    } else {
        "armv7-linux-androideabi"
    };
    format!("bin/{base}-{triple}")
}

/// A runnable binary: an extracted filesystem path (desktop) or a Tauri
/// sidecar name (Android mobile). Keeping it an enum lets the six spawn
/// points build the shell command without knowing the target platform.
pub enum Bin {
    /// Resolved filesystem path (desktop / non-Android). Never constructed on
    /// Android, where binaries resolve to a Tauri sidecar name.
    #[cfg_attr(target_os = "android", allow(dead_code))]
    Path(PathBuf),
    /// Tauri sidecar name for the current ABI (Android). Never constructed on
    /// desktop, where embedded/portable binaries resolve to a filesystem path.
    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    Sidecar(String),
}

impl Bin {
    /// Build the tauri-plugin-shell command, ready for `.args(..)` + `.spawn()`
    /// or `.output()`. On Android the shell plugin only resolves sidecars; the
    /// real yt-dlp flow is replaced by Chaquopy (see docs/MOBILE_SPIKE.md).
    pub fn shell_command(self, app: &tauri::AppHandle) -> Result<Command, String> {
        match self {
            Bin::Path(path) => Ok(app.shell().command(path)),
            Bin::Sidecar(name) => app
                .shell()
                .sidecar(&name)
                .map_err(|e| format!("sidecar {name}: {e}")),
        }
    }
}

/// Resolve a binary for spawn: desktop returns the runnable path, Android
/// returns the sidecar name for the current ABI.
pub fn resolve(app: &tauri::AppHandle, base: &str) -> Result<Bin, String> {
    #[cfg(target_os = "android")]
    {
        let _ = app;
        Ok(Bin::Sidecar(android_sidecar(base)))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        resolve_path(base).map(Bin::Path)
    }
}

/// Resolve ffmpeg path, if any. Used to pass `--ffmpeg-location` to yt-dlp.
#[cfg(not(target_os = "android"))]
pub fn ffmpeg_path() -> Option<PathBuf> {
    resolve_path("ffmpeg").ok()
}

/// Android never passes `--ffmpeg-location` to yt-dlp (it runs in-process via
/// Chaquopy); ffmpeg itself is executed from the app `nativeLibraryDir`.
#[cfg(target_os = "android")]
pub fn ffmpeg_path() -> Option<PathBuf> {
    None
}
