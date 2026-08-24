//! Self-contained sidecar binaries.
//!
//! yt-dlp and ffmpeg are embedded into the main executable so a single
//! `clip_harbour.exe` can run everything without moving companion files.
//! Binaries are extracted on first run to `%LOCALAPPDATA%\clip_harbour\bin`.
//!
//! Resolution order per binary:
//!   1. Copy next to the current executable (portable layout, e.g. installed
//!      by the NSIS/MSI bundler).
//!   2. Dev layout (`yt-dlp-x86_64-pc-windows-msvc.exe` next to the exe).
//!   3. Embedded copy extracted to the app data dir.

use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
const YTDLP_BYTES: &[u8] =
    include_bytes!("../binaries/yt-dlp-x86_64-pc-windows-msvc.exe");
#[cfg(target_os = "windows")]
const FFMPEG_BYTES: &[u8] =
    include_bytes!("../binaries/ffmpeg-x86_64-pc-windows-msvc.exe");

#[cfg(not(target_os = "windows"))]
const YTDLP_BYTES: &[u8] = b"";
#[cfg(not(target_os = "windows"))]
const FFMPEG_BYTES: &[u8] = b"";

const TRIPLE: &str = "x86_64-pc-windows-msvc";

fn file_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

/// Directory where embedded binaries are extracted on first run.
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
pub fn ensure() -> Result<PathBuf, String> {
    let dir = extracted_dir()?;
    write_if_changed(&dir, &file_name("yt-dlp"), YTDLP_BYTES)?;
    write_if_changed(&dir, &file_name("ffmpeg"), FFMPEG_BYTES)?;
    Ok(dir)
}

/// Resolve the runnable path for a binary (`yt-dlp` / `ffmpeg`), preferring a
/// local copy over the embedded one so the portable layout keeps working.
pub fn resolve(base: &str) -> Result<PathBuf, String> {
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

/// Resolve ffmpeg path, if any. Used to pass `--ffmpeg-location` to yt-dlp.
pub fn ffmpeg_path() -> Option<PathBuf> {
    resolve("ffmpeg").ok()
}
