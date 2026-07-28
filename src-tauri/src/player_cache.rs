use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const CACHE_MAX_BYTES: u64 = 1024 * 1024 * 1024; // 1 GB

pub fn player_cache_path() -> PathBuf {
    std::env::temp_dir().join("clip_harbour").join("cache")
}

#[tauri::command]
pub fn player_cache_dir() -> Result<String, String> {
    let dir = player_cache_path();
    fs::create_dir_all(&dir).map_err(|e| format!("cache dir: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn modified(path: &Path) -> SystemTime {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

/// Remove orphan partials / enforce LRU 1 GB.
#[tauri::command]
pub fn purge_player_cache() -> Result<(), String> {
    let dir = player_cache_path();
    if !dir.exists() {
        return Ok(());
    }

    let mut entries: Vec<(PathBuf, u64, SystemTime)> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read cache: {e}"))? {
        let entry = entry.map_err(|e| format!("read cache entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        // Drop incomplete yt-dlp temps
        if name.ends_with(".part")
            || name.ends_with(".ytdl")
            || name.contains(".f") && name.contains(".mp4.")
        {
            let _ = fs::remove_file(&path);
            continue;
        }
        entries.push((path.clone(), file_size(&path), modified(&path)));
    }

    entries.sort_by(|a, b| b.2.cmp(&a.2)); // newest first
    let mut used: u64 = 0;
    for (path, size, _) in entries {
        if used + size <= CACHE_MAX_BYTES {
            used += size;
        } else {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}
