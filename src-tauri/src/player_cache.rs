use std::fs;
use std::path::{Path, PathBuf};

/// Permanent Player downloads (Descargar vídeo).
pub fn player_keep_path() -> PathBuf {
    if let Ok(custom) = std::env::var("CLIP_HARBOUR_PLAYER_DIR") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    // Default is per-user so the path works on any PC (no hardcoded usernames).
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    if home.is_empty() {
        return PathBuf::from("MEmu video");
    }
    PathBuf::from(home).join("Music").join("MEmu video")
}

/// Ephemeral play cache (prev/now/next). Cleared on session end.
pub fn player_cache_path() -> PathBuf {
    player_keep_path().join(".cache")
}

fn playlists_root() -> PathBuf {
    player_keep_path().join("playlists")
}

fn sanitize_slug(slug: &str) -> Result<String, String> {
    let s = slug.trim();
    if s.is_empty() {
        return Err("empty playlist slug".into());
    }
    if s.contains("..") || s.contains('/') || s.contains('\\') || s.contains(':') {
        return Err("invalid playlist slug".into());
    }
    if s.chars().any(|c| r#"<>"|?*"#.contains(c) || c.is_control()) {
        return Err("invalid playlist slug".into());
    }
    Ok(s.to_string())
}

fn is_ytdlp_fragment(name: &str) -> bool {
    name.split('.').any(|part| {
        part.len() > 1
            && part.starts_with('f')
            && part[1..].chars().all(|c| c.is_ascii_digit())
    })
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn delete_id_files_in(dir: &Path, id: &str) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| format!("read dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if name == format!("{id}.mp4") || name.starts_with(&format!("{id}.")) {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

fn find_id_file_in_dir(dir: &Path, id: &str) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    let preferred = dir.join(format!("{id}.mp4"));
    if preferred.is_file() && file_size(&preferred) > 0 {
        return Some(preferred);
    }
    let mut best: Option<(PathBuf, u64)> = None;
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !(name == format!("{id}.mp4") || name.starts_with(&format!("{id}."))) {
            continue;
        }
        if name.ends_with(".part") || name.ends_with(".ytdl") || is_ytdlp_fragment(name) {
            continue;
        }
        let size = file_size(&path);
        if size == 0 {
            continue;
        }
        if best.as_ref().map(|(_, s)| size > *s).unwrap_or(true) {
            best = Some((path, size));
        }
    }
    best.map(|(p, _)| p)
}

fn find_in_any_playlist(id: &str) -> Option<PathBuf> {
    let root = playlists_root();
    if !root.exists() {
        return None;
    }
    let Ok(entries) = fs::read_dir(&root) else {
        return None;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Some(found) = find_id_file_in_dir(&path, id) {
            return Some(found);
        }
    }
    None
}

#[tauri::command]
pub fn player_cache_dir() -> Result<String, String> {
    let dir = player_cache_path();
    fs::create_dir_all(&dir).map_err(|e| format!("cache dir: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn player_keep_dir() -> Result<String, String> {
    let dir = player_keep_path();
    fs::create_dir_all(&dir).map_err(|e| format!("keep dir: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn playlist_dir(slug: String) -> Result<String, String> {
    let slug = sanitize_slug(&slug)?;
    let dir = playlists_root().join(slug);
    fs::create_dir_all(&dir).map_err(|e| format!("playlist dir: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn resolve_playlist_file(slug: String, video_id: String) -> Result<Option<String>, String> {
    let slug = sanitize_slug(&slug)?;
    let id = video_id.trim();
    if id.is_empty() {
        return Ok(None);
    }
    Ok(find_id_file_in_dir(&playlists_root().join(slug), id)
        .map(|p| p.to_string_lossy().into_owned()))
}

/// Video ids that have a finished `id.mp4` (or id.*) in the playlist folder.
#[tauri::command]
pub fn list_playlist_video_ids(slug: String) -> Result<Vec<String>, String> {
    let slug = sanitize_slug(&slug)?;
    let dir = playlists_root().join(&slug);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut ids = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read playlist: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if name.starts_with('.')
            || name.ends_with(".part")
            || name.ends_with(".ytdl")
            || is_ytdlp_fragment(&name)
        {
            continue;
        }
        if file_size(&path) == 0 {
            continue;
        }
        // Prefer stem of id.mp4
        if let Some(stem) = name.strip_suffix(".mp4") {
            if !stem.is_empty() && !stem.contains('.') {
                ids.push(stem.to_string());
                continue;
            }
        }
        // id.ext → take before first dot if looks like an id prefix
        if let Some((stem, _)) = name.split_once('.') {
            if !stem.is_empty() && !ids.iter().any(|x| x == stem) {
                ids.push(stem.to_string());
            }
        }
    }
    ids.sort();
    ids.dedup();
    Ok(ids)
}

/// Delete media files in a playlist folder (keeps the directory).
#[tauri::command]
pub fn clear_playlist_media(slug: String) -> Result<(), String> {
    let slug = sanitize_slug(&slug)?;
    let dir = playlists_root().join(&slug);
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&dir).map_err(|e| format!("read playlist: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        if path.is_file() {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

/// Append video id to playlists/<slug>/.archive.txt (download-archive style).
#[tauri::command]
pub fn append_playlist_archive(slug: String, video_id: String) -> Result<(), String> {
    let slug = sanitize_slug(&slug)?;
    let id = video_id.trim();
    if id.is_empty() {
        return Ok(());
    }
    let dir = playlists_root().join(&slug);
    fs::create_dir_all(&dir).map_err(|e| format!("playlist dir: {e}"))?;
    let archive = dir.join(".archive.txt");
    let existing = fs::read_to_string(&archive).unwrap_or_default();
    if existing.lines().any(|l| l.trim() == id) {
        return Ok(());
    }
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&archive)
        .map_err(|e| format!("archive: {e}"))?;
    writeln!(f, "{id}").map_err(|e| format!("archive write: {e}"))?;
    Ok(())
}

/// Copy an existing playable file (cache / any playlist / keep) into `playlists/<slug>/id.mp4`.
#[tauri::command]
pub fn promote_to_playlist(slug: String, video_id: String) -> Result<Option<String>, String> {
    let slug = sanitize_slug(&slug)?;
    let id = video_id.trim();
    if id.is_empty() {
        return Ok(None);
    }
    let dest_dir = playlists_root().join(&slug);
    fs::create_dir_all(&dest_dir).map_err(|e| format!("playlist dir: {e}"))?;
    let dest = dest_dir.join(format!("{id}.mp4"));
    if dest.is_file() && file_size(&dest) > 0 {
        return Ok(Some(dest.to_string_lossy().into_owned()));
    }

    // Prefer cache, then other playlists, then keep root — avoid copying from dest's own folder.
    let source = find_id_file_in_dir(&player_cache_path(), id)
        .or_else(|| {
            let root = playlists_root();
            if !root.exists() {
                return None;
            }
            let Ok(entries) = fs::read_dir(&root) else {
                return None;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
                if name == slug {
                    continue;
                }
                if let Some(found) = find_id_file_in_dir(&path, id) {
                    return Some(found);
                }
            }
            None
        })
        .or_else(|| find_id_file_in_dir(&player_keep_path(), id));

    let Some(src) = source else {
        return Ok(None);
    };
    if src == dest {
        return Ok(Some(dest.to_string_lossy().into_owned()));
    }
    fs::copy(&src, &dest).map_err(|e| format!("promote copy: {e}"))?;
    Ok(Some(dest.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn delete_playlist_file(slug: String, video_id: String) -> Result<(), String> {
    let slug = sanitize_slug(&slug)?;
    let id = video_id.trim();
    if id.is_empty() {
        return Ok(());
    }
    delete_id_files_in(&playlists_root().join(slug), id)
}

#[tauri::command]
pub fn delete_playlist_dir(slug: String) -> Result<(), String> {
    let slug = sanitize_slug(&slug)?;
    let dir = playlists_root().join(&slug);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("delete playlist dir: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_playlist_dir(old_slug: String, new_slug: String) -> Result<(), String> {
    let old = sanitize_slug(&old_slug)?;
    let new = sanitize_slug(&new_slug)?;
    if old == new {
        return Ok(());
    }
    let root = playlists_root();
    let from = root.join(&old);
    let to = root.join(&new);
    if !from.exists() {
        // Nothing on disk yet — ensure destination exists for future downloads.
        fs::create_dir_all(&to).map_err(|e| format!("playlist dir: {e}"))?;
        return Ok(());
    }
    if to.exists() {
        return Err(format!("playlist folder already exists: {new}"));
    }
    fs::rename(&from, &to).map_err(|e| format!("rename playlist dir: {e}"))?;
    Ok(())
}

/// Resolve playable file: active playlist → any playlist → cache → keep root.
#[tauri::command]
pub fn resolve_player_cache_file(
    video_id: String,
    active_slug: Option<String>,
) -> Result<Option<String>, String> {
    let id = video_id.trim();
    if id.is_empty() {
        return Ok(None);
    }

    if let Some(slug) = active_slug
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if let Ok(safe) = sanitize_slug(slug) {
            if let Some(p) = find_id_file_in_dir(&playlists_root().join(safe), id) {
                return Ok(Some(p.to_string_lossy().into_owned()));
            }
        }
    }

    if let Some(p) = find_in_any_playlist(id) {
        return Ok(Some(p.to_string_lossy().into_owned()));
    }

    if let Some(p) = find_id_file_in_dir(&player_cache_path(), id) {
        return Ok(Some(p.to_string_lossy().into_owned()));
    }

    // Keep root only (not playlists/ or .cache) — title-named keep downloads won't match id.
    if let Some(p) = find_id_file_in_dir(&player_keep_path(), id) {
        return Ok(Some(p.to_string_lossy().into_owned()));
    }

    Ok(None)
}

#[tauri::command]
pub fn delete_player_cache_file(video_id: String) -> Result<(), String> {
    let id = video_id.trim();
    if id.is_empty() {
        return Ok(());
    }
    // Only delete from ephemeral cache — never from keep or playlists.
    delete_id_files_in(&player_cache_path(), id)
}

/// Keep only these video ids' finished media in the ephemeral cache.
/// Does NOT delete .part / .ytdl / fragments — those are cleaned on purge/clear only,
/// so we never yank files out from under a running yt-dlp (WinError 32).
#[tauri::command]
pub fn prune_player_cache(keep_ids: Vec<String>) -> Result<(), String> {
    let dir = player_cache_path();
    if !dir.exists() {
        return Ok(());
    }
    let keep: Vec<String> = keep_ids
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    for entry in fs::read_dir(&dir).map_err(|e| format!("read cache: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        // Leave in-progress downloads alone.
        if name.ends_with(".part")
            || name.ends_with(".ytdl")
            || is_ytdlp_fragment(&name)
        {
            continue;
        }
        let retain = keep
            .iter()
            .any(|id| name == format!("{id}.mp4") || name.starts_with(&format!("{id}.")));
        if !retain {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

/// Wipe entire ephemeral cache (session end). Does not touch keep / playlists.
#[tauri::command]
pub fn clear_player_cache() -> Result<(), String> {
    let dir = player_cache_path();
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&dir).map_err(|e| format!("read cache: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        if path.is_file() {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

/// Remove incomplete temps/fragments only.
#[tauri::command]
pub fn purge_player_cache() -> Result<(), String> {
    let dir = player_cache_path();
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&dir).map_err(|e| format!("read cache: {e}"))? {
        let entry = entry.map_err(|e| format!("read entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if name.ends_with(".part") || name.ends_with(".ytdl") || is_ytdlp_fragment(&name) {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}
