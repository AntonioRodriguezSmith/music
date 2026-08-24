//! yt-dlp sidecar helpers: cookies, search, URL details and download args.
//!
//! Sections:
//!   1. Imports & constants
//!   2. General helpers (ffmpeg location, YouTube id extraction)
//!   3. Cookies (args, BOM sanitizing, candidates, auto-refresh)
//!   4. Error formatting & text helpers
//!   5. Download args (parse_config, audio metadata, auth-block detection)
//!   6. Tauri commands (version, top search, URL details)
//!   7. Tests

use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::binaries;
use crate::errors::AppError;
use crate::models::{parse_video_details, DownloadConfig, Video};
use crate::state::app_state;

/// Cookies de sesión mínimas que indican una sesión de YouTube/Google válida.
const SESSION_COOKIE_NAMES: &[&str] = &["SID", "SSID", "HSID", "LOGIN_INFO", "__Secure-3PSID"];

/// The ordered list of browsers tried by automatic cookie refresh. Firefox first
/// because `yt-dlp --cookies-from-browser` can read its jar without extra setup;
/// Chrome/Edge follow as fallbacks.
const REFRESH_BROWSERS: &[&str] = &["firefox", "chrome", "edge"];

// ---------------------------------------------------------------------------
// 2. General helpers
// ---------------------------------------------------------------------------

/// Path to the bundled ffmpeg binary (embedded, portable copy or dev sidecar).
pub fn ffmpeg_location() -> Option<String> {
    binaries::ffmpeg_path().map(|p| p.to_string_lossy().into_owned())
}

/// Extract a bare 11-char YouTube video id from a URL or a raw id.
pub fn youtube_video_id(url_or_id: &str) -> Option<String> {
    let value = url_or_id.trim();
    if value.is_empty() {
        return None;
    }

    let is_id_char = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_';
    if value.len() == 11 && value.chars().all(is_id_char) {
        return Some(value.to_string());
    }

    if let Some(rest) = value.split("v=").nth(1) {
        let id: String = rest.chars().take_while(|c| is_id_char(*c)).collect();
        if id.len() == 11 {
            return Some(id);
        }
    }

    if let Some(rest) = value.split("youtu.be/").nth(1) {
        let id: String = rest
            .chars()
            .take_while(|c| is_id_char(*c) && *c != '/' && *c != '?')
            .collect();
        if id.len() == 11 {
            return Some(id);
        }
    }

    if let Some(rest) = value.split("/shorts/").nth(1) {
        let id: String = rest
            .chars()
            .take_while(|c| is_id_char(*c) && *c != '/' && *c != '?')
            .collect();
        if id.len() == 11 {
            return Some(id);
        }
    }

    if let Some(rest) = value.split("/live/").nth(1) {
        let id: String = rest
            .chars()
            .take_while(|c| is_id_char(*c) && *c != '/' && *c != '?')
            .collect();
        if id.len() == 11 {
            return Some(id);
        }
    }

    None
}

// ---------------------------------------------------------------------------
// 3. Cookies
// ---------------------------------------------------------------------------

/// YouTube bot-check workaround: cookies file and/or --cookies-from-browser.
/// Env fallbacks: CLIP_HARBOUR_COOKIES, CLIP_HARBOUR_COOKIES_FROM_BROWSER.
pub fn append_cookie_args(
    args: &mut Vec<String>,
    cookies_file: Option<&str>,
    cookies_from_browser: Option<&str>,
) -> Result<(), String> {
    let file = cookies_file
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| std::env::var("CLIP_HARBOUR_COOKIES").ok())
        .filter(|s| !s.trim().is_empty());

    let browser = cookies_from_browser
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| std::env::var("CLIP_HARBOUR_COOKIES_FROM_BROWSER").ok())
        .filter(|s| !s.trim().is_empty());

    if let Some(path) = file {
        if !std::path::Path::new(&path).is_file() {
            return Err(format!("Cookies file not found: {path}"));
        }
        // yt-dlp rejects files saved with a UTF-8 BOM; strip it on a copy when
        // needed, and always drop expired cookies so a dead jar never ships to
        // yt-dlp. The original export stays untouched.
        let usable = prepare_cookie_file(&path)?;
        args.push("--cookies".to_string());
        args.push(usable);
    }
    if let Some(browser) = browser {
        args.push("--cookies-from-browser".to_string());
        args.push(browser);
    }
    Ok(())
}

/// Best-effort cookies for read-only commands (search / URL details): a stale
/// cookies file path must not block the whole query, since searches work fine
/// without cookies. Logs a warning and continues with the existing args.
pub fn append_cookie_args_lenient(
    args: &mut Vec<String>,
    cookies_file: Option<&str>,
    cookies_from_browser: Option<&str>,
) {
    if let Err(e) = append_cookie_args(args, cookies_file, cookies_from_browser) {
        eprintln!("warning: skipping cookies: {e}");
    }
}

/// Detect a UTF-8 BOM (EF BB BF) on the first bytes of a file.
fn has_utf8_bom(path: &std::path::Path) -> bool {
    use std::io::Read;
    if let Ok(mut f) = std::fs::File::open(path) {
        let mut buf = [0u8; 3];
        if f.read_exact(&mut buf).is_ok() {
            return buf == [0xEF, 0xBB, 0xBF];
        }
    }
    false
}

/// Temp cookie jars the app writes during refresh (`cookies_raw_<browser>.txt`)
/// and deletes afterwards. Never a valid persisted choice: they must not be
/// auto-picked nor kept as a stale `cookiesFile` reference.
pub fn is_tmp_cookie_name(path: &std::path::Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_ascii_lowercase().starts_with("cookies_raw_"))
        .unwrap_or(false)
}

/// True when `path` points to an existing cookies file that is not a temp jar
/// (`cookies_raw_*.txt`). Used by the frontend to detect stale persisted
/// selections (e.g. a deleted temp file) and let the auto-refresh fix them.
#[tauri::command]
pub fn cookies_file_valid(path: String) -> bool {
    let p = std::path::Path::new(&path);
    p.is_file() && !is_tmp_cookie_name(p)
}

/// Resolved `cookies_merged.txt` in the app cookies dir, when it exists. Used
/// as a fallback when the configured cookies file is missing at download time.
pub fn app_merged_cookies_path(app: &tauri::AppHandle) -> Option<String> {
    let dir = resolve_cookies_dir(app, None).ok()?;
    let merged = dir.join("cookies_merged.txt");
    merged.is_file().then(|| merged.to_string_lossy().into_owned())
}

/// Return a path usable by yt-dlp, copying the file without its BOM if present.
/// Creates a sibling `<name>.nobom.txt` so the original export stays untouched.
fn sanitize_cookie_path(path: &str) -> Result<String, String> {
    let p = std::path::Path::new(path);
    if !has_utf8_bom(p) {
        return Ok(path.to_string());
    }
    let data = std::fs::read(p).map_err(|e| format!("read cookies {path}: {e}"))?;
    let body = data
        .get(3..)
        .unwrap_or(&data)
        .to_vec();
    let dir = p.parent().unwrap_or_else(|| std::path::Path::new("."));
    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("cookies");
    let clean = dir.join(format!("{file_name}.nobom.txt"));
    std::fs::write(&clean, &body).map_err(|e| format!("write clean cookies {}: {e}", clean.display()))?;
    eprintln!("stripped UTF-8 BOM from {} -> {}", path, clean.display());
    Ok(clean.to_string_lossy().into_owned())
}

/// Expiry (Unix seconds) of a Netscape cookie line, or `None` for
/// comments/blank/malformed lines. Field index 4 is the expiry; 0 = session.
fn cookie_line_expiry(line: &str) -> Option<i64> {
    let line = line.strip_prefix('\u{FEFF}').unwrap_or(line);
    if line.trim().is_empty() || line.trim_start().starts_with('#') {
        return None;
    }
    let parts: Vec<&str> = line.splitn(7, '\t').collect();
    if parts.len() < 7 {
        return None;
    }
    parts[4].trim().parse::<i64>().ok()
}

/// Produce a yt-dlp-usable cookie file: strip a UTF-8 BOM (via
/// [`sanitize_cookie_path`]) and drop expired cookies (expiry > 0 earlier than
/// now), keeping session cookies (expiry 0). Returns the input path when no
/// cleaning is needed; otherwise writes a sibling `<name>.clean.txt` so the
/// original export is never modified. Applies to ANY file the app passes to
/// yt-dlp (manual pick, env var), not just auto-refreshed jars.
fn prepare_cookie_file(path: &str) -> Result<String, String> {
    // Strip BOM first (may write `<name>.nobom.txt`).
    let bom_free = sanitize_cookie_path(path)?;
    let p = std::path::Path::new(&bom_free);

    // Best-effort text read: non-UTF-8 jars are not valid Netscape anyway.
    let Ok(content) = std::fs::read_to_string(p) else {
        return Ok(bom_free);
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let mut out = String::with_capacity(content.len());
    let mut removed = 0usize;
    for line in content.lines() {
        match cookie_line_expiry(line) {
            Some(expiry) if expiry > 0 && expiry < now => removed += 1,
            _ => {
                out.push_str(line);
                out.push('\n');
            }
        }
    }
    if removed == 0 {
        return Ok(bom_free);
    }

    let dir = p.parent().unwrap_or_else(|| std::path::Path::new("."));
    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("cookies");
    let clean = dir.join(format!("{file_name}.clean.txt"));
    std::fs::write(&clean, out)
        .map_err(|e| format!("write clean cookies {}: {e}", clean.display()))?;
    eprintln!(
        "dropped {removed} expired cookie(s): {} -> {}",
        path,
        clean.display()
    );
    Ok(clean.to_string_lossy().into_owned())
}

/// Primary location for app-managed cookies: `<app_data_dir>/cookies`
/// (Windows: `%APPDATA%\com.clip-harbour.app\cookies`). Created on demand,
/// per-user by construction and outside the repo / sync folders.
fn app_cookies_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?
        .join("cookies");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("create cookies dir {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Legacy per-user folder (`%USERPROFILE%\cookies_youtube`) kept as a fallback
/// while it still holds candidates, so existing setups keep working.
fn legacy_cookies_dir() -> Option<std::path::PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let dir = std::path::PathBuf::from(home).join("cookies_youtube");
    dir.is_dir().then_some(dir)
}

/// True when `dir` contains at least one `*.txt` file.
fn has_cookie_txt_files(dir: &std::path::Path) -> bool {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries.flatten().any(|e| {
                e.path().is_file()
                    && e.path()
                        .extension()
                        .map(|ext| ext.eq_ignore_ascii_case("txt"))
                        .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Resolve the cookies directory shared by `list_cookie_candidates` and the
/// auto-refresh command so reading and writing always agree on the same folder.
///
/// Precedence:
///   1. explicit `dir` argument (frontend-provided folder)
///   2. `CLIP_HARBOUR_COOKIES_DIR` env var
///   3. the legacy `%USERPROFILE%\cookies_youtube` folder while it still has
///      candidates (backward compat for existing setups)
///   4. the app-managed folder (`<app_data_dir>/cookies`) — the new default,
///      so auto-generated cookies live inside the app instead of the profile.
fn resolve_cookies_dir(
    app: &tauri::AppHandle,
    dir: Option<&str>,
) -> Result<std::path::PathBuf, String> {
    if let Some(d) = dir.map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(std::path::PathBuf::from(d));
    }
    if let Ok(d) = std::env::var("CLIP_HARBOUR_COOKIES_DIR") {
        let d = d.trim();
        if !d.is_empty() {
            return Ok(std::path::PathBuf::from(d));
        }
    }
    if let Some(legacy) = legacy_cookies_dir() {
        if has_cookie_txt_files(&legacy) {
            return Ok(legacy);
        }
    }
    app_cookies_dir(app)
}

/// Absolute path of the folder where the app stores/reads cookies (resolved by
/// [`resolve_cookies_dir`], same rules as `list_cookie_candidates`). Used by the
/// sidebar "Abrir carpeta" button for the cookies section.
#[tauri::command]
pub fn cookies_dir(app: tauri::AppHandle, dir: Option<String>) -> Result<String, String> {
    let root = resolve_cookies_dir(&app, dir.as_deref())?;
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("create cookies dir {}: {e}", root.display()))?;
    Ok(root.to_string_lossy().into_owned())
}

/// Scan a directory for candidate `cookies.txt` Netscape files. The directory
/// is resolved by [`resolve_cookies_dir`]: explicit `dir`, `CLIP_HARBOUR_COOKIES_DIR`,
/// the legacy `cookies_youtube` folder, or the app-managed cookies folder.
///
/// Files saved with a UTF-8 BOM are still returned (they are automatically
/// stripped of the BOM when used; see `sanitize_cookie_path`). Ordered so the
/// most likely filenames ("cookies_merged", "cookies_chrome", …) come first.
#[tauri::command]
pub fn list_cookie_candidates(
    app: tauri::AppHandle,
    dir: Option<String>,
) -> Result<Vec<String>, String> {
    let root = resolve_cookies_dir(&app, dir.as_deref())?;

    if !root.is_dir() {
        return Ok(vec![]);
    }

    let mut candidates = vec![];
    let entries =
        std::fs::read_dir(&root).map_err(|e| format!("read dir {}: {e}", root.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // Temp jars (`cookies_raw_<browser>.txt`) are deleted after refresh and
        // must never surface as selectable candidates.
        if is_tmp_cookie_name(&path) {
            continue;
        }
        let Some(ext) = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase())
        else {
            continue;
        };
        if ext != "txt" {
            continue;
        }
        if let Some(name) = entry.file_name().to_str() {
            candidates.push(name.to_string());
        }
    }
    let score = |name: &str| -> i32 {
        let lower = name.to_ascii_lowercase();
        if lower.starts_with("cookies_merged") {
            0
        } else if lower.starts_with("cookies_chrome")
            || lower.starts_with("cookies_edge")
            || lower.starts_with("cookies_firefox")
            || lower.starts_with("cookies.txt")
        {
            1
        } else if lower.contains("youtube") {
            2
        } else {
            3
        }
    };
    candidates.sort_by_key(|n| (score(n), n.clone()));

    let trimmed = root.to_string_lossy().trim_end_matches('\\').to_string();
    Ok(candidates
        .into_iter()
        .map(|name| format!("{trimmed}\\{name}"))
        .collect())
}

/// Returns true when `domain` belongs to YouTube / Google, mirroring the filter
/// used by `scripts/filter-youtube-cookies.ps1`.
fn is_youtube_domain(domain: &str) -> bool {
    let d = domain.to_ascii_lowercase();
    d.contains("youtube")
        || d.contains("google")
        || d.contains("googlevideo")
        || d.contains("ytimg")
        || d.contains("ggpht")
        || d.contains("gstatic")
}

/// Parse a line of a Netscape HTTP cookie file, returning `(domain, path,
/// name, expiry, normalized_line)` if the entry is well-formed and belongs to a
/// YouTube/Google domain. Mirrors `filter-youtube-cookies.ps1` (line fields:
/// domain, flag, path, secure, expiry, name, value).
fn parse_cookie_line(line: &str) -> Option<(String, String, String, i64, String)> {
    // Strip a UTF-8 BOM on the very first field if present.
    let line = line.strip_prefix('\u{FEFF}').unwrap_or(line);
    if line.trim().is_empty() || line.trim_start().starts_with('#') {
        return None;
    }
    let parts: Vec<&str> = line.splitn(7, '\t').collect();
    if parts.len() < 7 {
        return None;
    }
    let domain = parts[0].trim();
    if domain.is_empty() || !is_youtube_domain(domain) {
        return None;
    }
    let name = parts[5].trim();
    let value = parts[6].trim();
    if name.is_empty() || value.is_empty() {
        return None;
    }
    let mut flag = parts[1].trim().to_ascii_uppercase();
    let path = parts[2].trim().to_string();
    let mut secure = parts[3].trim().to_ascii_uppercase();
    let expiry = parts[4].trim().parse::<i64>().unwrap_or(0i64);

    // Netscape / yt-dlp: a leading "." on the domain requires flag TRUE.
    if domain.starts_with('.') {
        flag = "TRUE".to_string();
    } else if flag != "TRUE" && flag != "FALSE" {
        flag = "FALSE".to_string();
    }
    if secure != "TRUE" && secure != "FALSE" {
        secure = "FALSE".to_string();
    }

    let normalized = format!(
        "{}\t{}\t{}\t{}\t{}\t{}\t{}",
        domain, flag, path, secure, expiry, name, value
    );
    Some((domain.to_string(), path, name.to_string(), expiry, normalized))
}

/// Port of `scripts/filter-youtube-cookies.ps1`: read `raw_path`, keep only
/// YouTube/Google cookies, dedupe by `domain\tpath\tname` keeping the latest
/// expiry, drop expired cookies, and write a UTF-8 (no BOM) Netscape file at
/// `out_path`. Returns the number of cookies written. Errors when no usable
/// session cookie is present (so the caller can try another browser).
fn enrich_cookies(
    raw_path: &str,
    out_path: &str,
    source_browser: Option<&str>,
) -> Result<usize, String> {
    use std::collections::HashMap;

    let content =
        std::fs::read_to_string(raw_path).map_err(|e| format!("read raw cookies: {e}"))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let mut by_key: HashMap<String, (i64, String)> = HashMap::new();
    let mut has_session = false;
    for line in content.lines() {
        if let Some((domain, path, name, expiry, normalized)) = parse_cookie_line(line) {
            // Expiry 0 = session cookie (válida mientras dure la sesión).
            // Expiry > 0 caducada: se descarta para que un jar muerto no
            // cuente como "válido" y fuerce probar el siguiente navegador.
            if expiry > 0 && expiry < now {
                continue;
            }
            if SESSION_COOKIE_NAMES.iter().any(|s| s.eq_ignore_ascii_case(&name)) {
                has_session = true;
            }
            let key = format!("{domain}\t{path}\t{name}");
            match by_key.get(&key) {
                Some((existing_expiry, _)) if *existing_expiry > expiry => {}
                _ => {
                    by_key.insert(key, (expiry, normalized));
                }
            }
        }
    }

    if by_key.is_empty() {
        return Err(
            "No YouTube/Google cookies kept. Inicia sesión en YouTube y reintenta.".to_string(),
        );
    }
    if !has_session {
        return Err(format!(
            "Cookies sin sesión válida (faltan SID/HSID). Navegador: {}",
            source_browser.unwrap_or("desconocido")
        ));
    }

    let mut lines: Vec<String> = vec![];
    lines.push("# Netscape HTTP Cookie File".to_string());
    lines.push(
        "# Auto-extracted and enriched for Clip Harbour / yt-dlp (YouTube + Google). UTF-8 no BOM."
            .to_string(),
    );
    lines.push(format!(
        "# Source browser: {} (via --cookies-from-browser)",
        source_browser.unwrap_or("desconocido")
    ));
    let mut entries: Vec<&String> = by_key.values().map(|(_, l)| l).collect();
    entries.sort();
    lines.extend(entries.into_iter().cloned());

    std::fs::write(out_path, lines.join("\n"))
        .map_err(|e| format!("write merged cookies {out_path}: {e}"))?;
    Ok(by_key.len())
}

/// Auto-refresh cookies from a single browser and enrich them into
/// `cookies_merged.txt`. Returns the absolute path of the refreshed file, or an
/// error that lets the caller keep using a previously saved cookies file.
///
/// Extraction uses `yt-dlp --cookies-from-browser <browser> --cookies <tmp>`
/// *without a URL*: this dumps the browser jar into a file but exits non-zero
/// ("You must provide at least one URL"), so the exit status is ignored and the
/// result is validated by the file content. The temp path is deleted first
/// because yt-dlp does not overwrite an existing --cookies target.
#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_cookies(
    app: tauri::AppHandle,
    browser: Option<String>,
) -> Result<String, String> {
    let browser = browser
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "firefox".to_string());
    refresh_cookies_from(app, &browser).await
}

/// Auto-refresh cookies trying every browser in [`REFRESH_BROWSERS`] in order,
/// returning the first that yields YouTube/Google cookies. If every browser
/// fails, a previously generated `cookies_merged.txt` (still on disk) is kept
/// and returned so the app always has a functional TXT file in its path.
#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_cookies_all(app: tauri::AppHandle) -> Result<String, String> {
    let mut errors = Vec::new();
    for &browser in REFRESH_BROWSERS {
        match refresh_cookies_from(app.clone(), browser).await {
            Ok(path) => return Ok(path),
            Err(e) => errors.push(format!("{browser}: {e}")),
        }
    }
    if let Some(merged) = app_merged_cookies_path(&app) {
        eprintln!(
            "all browsers failed; keeping existing cookies file {}",
            merged
        );
        return Ok(merged);
    }
    Err(format!(
        "No se pudo extraer cookies de ningún navegador.\n{}",
        errors.join("\n")
    ))
}

/// Core single-browser refresh used by both [`refresh_cookies`] and
/// [`refresh_cookies_all`]. Always writes to `cookies_merged.txt`.
async fn refresh_cookies_from(
    app: tauri::AppHandle,
    browser: &str,
) -> Result<String, String> {
    let dir_path = resolve_cookies_dir(&app, None)?;
    if !dir_path.is_dir() {
        return Err(format!(
            "Carpeta de cookies no encontrada: {}",
            dir_path.display()
        ));
    }

    let tmp = dir_path.join(format!("cookies_raw_{browser}.txt"));
    let _ = std::fs::remove_file(&tmp);

    let tmp_str = tmp.to_string_lossy().into_owned();
    let extracted = app
        .shell()
        .command(binaries::resolve("yt-dlp")?)
        .args(["--cookies-from-browser", browser, "--cookies", tmp_str.as_str()])
        .output()
        .await;

    // Exit status is unreliable (non-zero even on success); validate the file.
    if extracted.is_err() && !tmp.is_file() {
        return Err(format!(
            "No se pudo extraer cookies del navegador ({browser}). Verifica que esté instalado."
        ));
    }
    if !tmp.is_file() {
        return Err(
            "No se pudo extraer cookies del navegador. Revisa la consola o usa el panel de cookies."
                .to_string(),
        );
    }

    let out = dir_path.join("cookies_merged.txt");
    let out_str = out.to_string_lossy().into_owned();
    let count = enrich_cookies(&tmp_str, &out_str, Some(browser))?;
    let _ = std::fs::remove_file(&tmp);

    eprintln!("refresh_cookies: wrote {count} cookies to {out_str} (browser: {browser})");
    Ok(out_str)
}

// ---------------------------------------------------------------------------
// 4. Error formatting & text helpers
// ---------------------------------------------------------------------------

fn first_error_line(stderr: &str) -> Option<&str> {
    stderr.lines().find(|line| {
        let t = line.trim();
        t.starts_with("ERROR:") || t.contains("ERROR:")
    })
}

/// Truncate `raw` to at most `max` bytes without splitting a UTF-8 char,
/// appending an ellipsis when it had to cut. Byte-slicing a String mid-char
/// panics (and would crash the app), so step back to the nearest boundary.
pub fn truncate_utf8(raw: &str, max: usize) -> String {
    let trimmed = raw.trim();
    if trimmed.len() <= max {
        return trimmed.to_string();
    }
    let mut end = max;
    while end > 0 && !trimmed.is_char_boundary(end) {
        end -= 1;
    }
    if end == 0 {
        "…".to_string()
    } else {
        format!("{}…", &trimmed[..end])
    }
}

/// Keep the last `max_bytes` bytes of `raw` without splitting a UTF-8 char.
pub fn tail_utf8(raw: &str, max_bytes: usize) -> String {
    if raw.len() <= max_bytes {
        return raw.to_string();
    }
    let mut start = raw.len() - max_bytes;
    while start < raw.len() && !raw.is_char_boundary(start) {
        start += 1;
    }
    raw[start..].to_string()
}

/// Classify yt-dlp stderr into a stable [`AppError`] with a short actionable
/// message and the original yt-dlp line as `detail`.
pub fn format_ytdlp_error(stderr: &str, fallback: String) -> AppError {
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        return AppError::internal(fallback);
    }
    if trimmed.contains("does not look like a Netscape format cookies file")
        || (trimmed.contains("skipping cookie file entry") && trimmed.contains("User-agent:"))
    {
        let detail = first_error_line(trimmed).unwrap_or(
            "ERROR: cookies file does not look like a Netscape format cookies file",
        );
        return AppError::with_detail(
            crate::errors::codes::COOKIES_INVALID,
            "El archivo de cookies no es válido. Exporta cookies reales (Netscape) con una \
extensión tras iniciar sesión en YouTube y elígela en la sidebar.",
            detail,
        );
    }
    if trimmed.contains("Unable to create directory")
        || trimmed.contains("Access is denied")
        || trimmed.contains("Acceso denegado")
        || trimmed.contains("WinError")
    {
        let detail = first_error_line(trimmed).unwrap_or("ERROR: unable to create directory");
        return AppError::with_detail(
            crate::errors::codes::DIR_ACCESS,
            "No se pudo crear la carpeta de descarga (permiso denegado). Elige otra carpeta o \
comprueba que la ruta exista.",
            detail,
        );
    }
    if trimmed.contains("rate-limited")
        || trimmed.contains("rate limited")
        || (trimmed.contains("isn't available, try again later")
            && trimmed.contains("YouTube"))
    {
        let detail = first_error_line(trimmed).unwrap_or("ERROR: YouTube rate limit");
        return AppError::with_detail(
            crate::errors::codes::RATE_LIMIT,
            "YouTube ha limitado esta sesión (hasta ~1 hora). Espera un rato y evita lanzar \
varios vídeos seguidos.",
            detail,
        );
    }
    if trimmed.contains("Sign in to confirm") || trimmed.contains("not a bot") {
        let detail =
            first_error_line(trimmed).unwrap_or("ERROR: Sign in to confirm you're not a bot");
        return AppError::with_detail(
            crate::errors::codes::AUTH_BLOCK,
            "YouTube pide confirmar que no eres un bot. Configura un cookies.txt en la sidebar \
o espera unos minutos.",
            detail,
        );
    }
    // Prefer a single ERROR line over dumping all WARNINGs.
    if let Some(err) = first_error_line(trimmed) {
        return AppError::with_detail(
            crate::errors::codes::YTDLP_FAILED,
            "yt-dlp no pudo completar la operación.",
            err.trim(),
        );
    }
    // Cap residual stderr so the search UI cannot fill with noise.
    const MAX: usize = 400;
    AppError::new(
        crate::errors::codes::YTDLP_FAILED,
        truncate_utf8(trimmed, MAX),
    )
}

// ---------------------------------------------------------------------------
// 5. Download args
// ---------------------------------------------------------------------------

/// Default download folder: `%USERPROFILE%\Music\ClipHarbour` (created on demand).
pub fn default_download_dir() -> Option<String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    Some(
        std::path::PathBuf::from(home)
            .join("Music")
            .join("ClipHarbour")
            .to_string_lossy()
            .into_owned(),
    )
}

/// Ensure a usable download folder. Tries the requested `dir` first (creating
/// it), then falls back to `%USERPROFILE%\Music\ClipHarbour`. This prevents
/// yt-dlp from failing with an obscure `WinError 5` when the persisted path
/// belongs to another user (e.g. a `C:\Users\rodri\…` copied from another PC).
pub fn sanitize_download_dir(dir: Option<&str>) -> Result<String, String> {
    let requested = dir.map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    for candidate in requested.into_iter().chain(default_download_dir()) {
        match std::fs::create_dir_all(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(e) => eprintln!("warning: cannot use download dir {candidate}: {e}"),
        }
    }
    Err(format!(
        "error:{}: No se pudo crear la carpeta de descarga (permiso denegado). Elige otra carpeta.",
        crate::errors::codes::DIR_ACCESS
    ))
}

/// Validate + create the destination folder at startup so the sidebar always
/// shows a working path (falls back to `%USERPROFILE%\Music\ClipHarbour` when
/// the stored path is stale or belongs to another user).
#[tauri::command(rename_all = "snake_case")]
pub fn resolve_download_dir(dir: Option<String>) -> Result<String, String> {
    sanitize_download_dir(dir.as_deref())
}

pub fn parse_config(config: DownloadConfig) -> Result<Vec<String>, String> {
    let mut args = vec![
        config.url.clone(),
        "--newline".to_string(),
        "--progress-template".to_string(),
        "%(progress)j".to_string(),
        "--progress".to_string(),
        "--no-playlist".to_string(),
    ];

    append_cookie_args(
        &mut args,
        config.cookies_file.as_deref(),
        config.cookies_from_browser.as_deref(),
    )?;

    let is_cache = config.purpose.as_deref() == Some("cache");
    let is_keep = config.purpose.as_deref() == Some("keep");
    let is_playlist = config.purpose.as_deref() == Some("playlist");
    let is_merged_video = is_cache || is_keep || is_playlist;
    let id_filename = is_cache || is_playlist;

    // Do NOT sleep inside Player cache downloads: --sleep-interval runs before each
    // stream (video+audio ⇒ 10–24s) and --sleep-requests pauses every extractor HTTP call.
    // Inter-job pacing lives in queue::schedule_pending. Offline/bulk can still sleep.
    if !is_cache {
        // CLIP_HARBOUR_YT_SLEEP=soft|strict (default soft).
        let sleep_mode = std::env::var("CLIP_HARBOUR_YT_SLEEP")
            .unwrap_or_else(|_| "soft".into())
            .to_ascii_lowercase();
        let (sleep_requests, min_sleep, max_sleep) = if sleep_mode == "strict" {
            ("1.5", "3", "8")
        } else {
            ("0.75", "1.5", "4")
        };
        args.push("--sleep-requests".to_string());
        args.push(sleep_requests.to_string());
        args.push("--min-sleep-interval".to_string());
        args.push(min_sleep.to_string());
        args.push("--max-sleep-interval".to_string());
        args.push(max_sleep.to_string());
    }

    if let Some(ffmpeg) = ffmpeg_location() {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg);
    }

    // Regular audio downloads (USB BMW / Standard / PC / Player→audio): filename = song
    // title only; artist goes into file tags. Player cache/keep/playlist keep id or full title.
    let is_audio_download = !is_merged_video;

    if let Some(dir) = config.output_dir.filter(|x| !x.is_empty()) {
        args.push("-P".to_string());
        args.push(dir);
        args.push("-o".to_string());
        if id_filename {
            // Stable id so we can prune/delete / resolve by video id.
            args.push("%(id)s.%(ext)s".to_string());
        } else if is_audio_download {
            // Prefer extractor track name; after parse-metadata, title is the song part.
            args.push("%(track,title).200B.%(ext)s".to_string());
        } else {
            args.push("%(title).200B.%(ext)s".to_string());
        }
    }

    if is_audio_download {
        append_audio_metadata_args(&mut args);
    }

    if let Some(format) = config.format.filter(|x| !x.is_empty()) {
        args.push("-f".to_string());
        args.push(format);
    } else if is_merged_video {
        args.push("-f".to_string());
        args.push("bv*[height<=720]+ba/b".to_string());
    } else {
        args.push("-f".to_string());
        args.push("bestaudio/best".to_string());
    }

    if is_merged_video {
        args.push("--merge-output-format".to_string());
        args.push("mp4".to_string());
    }

    if let Some(proxy) = config.proxy_url.filter(|x| !x.is_empty()) {
        args.push("--proxy".to_string());
        args.push(proxy);
    }
    if config.embed_subtitles == Some(true) {
        args.push("--embed-subs".to_string());
    }
    // Audio: always embed so the car / file browser sees artist + title tags.
    if is_audio_download || config.embed_metadata == Some(true) {
        args.push("--embed-metadata".to_string());
    }
    if config.embed_thumbnail == Some(true) {
        args.push("--embed-thumbnail".to_string());
    }

    Ok(args)
}

/// BMW / USB-friendly tags: filename = song title only; tags = title, artist, album.
/// Parses YouTube "Artist - Title | Album" and strips [id] / Official / Visualizer fluff.
fn append_audio_metadata_args(args: &mut Vec<String>) {
    // 1) Artist - Title | Album (album optional).
    args.push("--parse-metadata".to_string());
    args.push(
        r"title:^(?P<artist>.+?)\s*[-–—]\s*(?P<title>.+?)(?:\s*[\u007C\uFF5C/]\s*(?P<album>.+))?$"
            .to_string(),
    );
    // 2) Title | Album when there was no "Artist - …" pattern.
    args.push("--parse-metadata".to_string());
    args.push(
        r"title:^(?P<title>.+?)\s*[\u007C\uFF5C/]\s*(?P<album>.+)$".to_string(),
    );
    // 3) Prefer extractor artist, else uploader/channel (does not wipe a better artist).
    args.push("--parse-metadata".to_string());
    args.push(r"%(artist,uploader,channel)s:^(?P<artist>.+)$".to_string());
    // 4) Keep album when the extractor already set one.
    args.push("--parse-metadata".to_string());
    args.push(r"%(album|)s:^(?P<album>.+)$".to_string());

    // 5) Clean title / album / artist for car indexers (no YouTube id, no marketing tags).
    let marketing = (
        r"(?i)\s*[\(\[](?:official\s*)?(?:video|audio|visualizer|lyric\s*video|music\s*video|video oficial|audio oficial|official audio|official video|video visual|short film)[^\)\]]*[\)\]]",
        "",
    );
    let youtube_id = (r"\s*\[[\w-]{11}\]\s*$", "");
    let multi_space = (r"\s{2,}", " ");
    let trim_ends = (r"^\s+|\s+$", "");
    let prod_credit = (
        r"(?i)\s*\((?:prod\.?\s*by|produced by|shot by|video by)[^)]*\)",
        "",
    );

    for field in ["title", "album", "artist"] {
        for (regex, replace) in [
            marketing,
            youtube_id,
            prod_credit,
            multi_space,
            trim_ends,
        ] {
            args.push("--replace-in-metadata".to_string());
            args.push(field.to_string());
            args.push(regex.to_string());
            args.push(replace.to_string());
        }
    }
}

pub fn download_has_cookies(config: &DownloadConfig) -> bool {
    let file = config
        .cookies_file
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
        || std::env::var("CLIP_HARBOUR_COOKIES")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .is_some();
    let browser = config
        .cookies_from_browser
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
        || std::env::var("CLIP_HARBOUR_COOKIES_FROM_BROWSER")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .is_some();
    file || browser
}

pub fn is_auth_block_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("403")
        || lower.contains("sign in to confirm")
        || lower.contains("not a bot")
}

// ---------------------------------------------------------------------------
// 6. Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
pub async fn get_ytdlp_version(app: tauri::AppHandle) -> Result<String, String> {
    let sidecar_command = app
        .shell()
        .command(binaries::resolve("yt-dlp")?)
        .args(["--version"]);
    let output = sidecar_command
        .output()
        .await
        .map_err(|e| format!("yt-dlp --version failed: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp --version empty: {stderr}"));
    }
    Ok(stdout)
}

#[derive(Clone, Serialize)]
pub struct SearchUpdatePayload {
    pub search_id: u64,
    pub results: Vec<Video>,
}

/// Cancel the in-flight top search (if any): bump the search id so the running
/// `get_top_search` stops being "current", and kill its yt-dlp child.
#[tauri::command(rename_all = "snake_case")]
pub fn cancel_search(app: tauri::AppHandle) -> Result<(), AppError> {
    let state = app_state(&app);
    state.active_search_id.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut slot) = state.active_search.lock() {
        if let Some(child) = slot.take() {
            if let Err(e) = child.kill() {
                eprintln!("failed to kill search: {e}");
            }
        }
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_top_search(
    app: tauri::AppHandle,
    query: String,
    cookies_file: Option<String>,
    cookies_from_browser: Option<String>,
    search_id: Option<u64>,
    // ytsearchN size (default 50, max 100)
    limit: Option<u32>,
) -> Result<(), AppError> {
    let search_id = search_id.unwrap_or(0);
    let limit = limit.unwrap_or(50).clamp(1, 100);
    let state = app_state(&app);
    state.active_search_id.store(search_id, Ordering::SeqCst);

    // Cancel any in-flight search so a new query can start immediately.
    if let Ok(mut slot) = state.active_search.lock() {
        if let Some(prev) = slot.take() {
            if let Err(e) = prev.kill() {
                eprintln!("failed to kill previous search: {e}");
            }
        }
    }

    let mut args = vec![
        format!("ytsearch{limit}:{query}"),
        "--dump-json".to_string(),
        "--no-playlist".to_string(),
    ];
    append_cookie_args_lenient(
        &mut args,
        cookies_file.as_deref(),
        cookies_from_browser.as_deref(),
    );
    let sidecar_command = app
        .shell()
        .command(binaries::resolve("yt-dlp")?)
        .args(args);
    let (mut rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {e}"))?;

    if let Ok(mut slot) = state.active_search.lock() {
        // Another search may have started while we spawned; drop ours if superseded.
        if state.active_search_id.load(Ordering::SeqCst) != search_id {
            let _ = child.kill();
            return Ok(());
        }
        *slot = Some(child);
    }

    let is_current = || state.active_search_id.load(Ordering::SeqCst) == search_id;

    let mut search_results: Vec<Video> = vec![];
    let mut last_stderr = String::new();
    let mut stdout_buf = String::new();

    while let Some(event) = rx.recv().await {
        if !is_current() {
            break;
        }
        match event {
            CommandEvent::Stdout(data_bytes) => {
                stdout_buf.push_str(&String::from_utf8_lossy(&data_bytes));
                while let Some(pos) = stdout_buf.find('\n') {
                    let line = stdout_buf[..pos].trim().to_string();
                    stdout_buf = stdout_buf[pos + 1..].to_string();
                    if line.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<Video>(&line) {
                        Ok(video) => {
                            let processed_video: Video = parse_video_details(video);
                            let video_id = youtube_video_id(&processed_video.url);
                            let already = search_results.iter().any(|v| {
                                if let Some(id) = video_id.as_ref() {
                                    youtube_video_id(&v.url).as_ref() == Some(id)
                                } else {
                                    !v.url.is_empty() && v.url == processed_video.url
                                }
                            });
                            if already {
                                continue;
                            }
                            search_results.push(processed_video);
                            if !is_current() {
                                break;
                            }
                            let _ = app.emit(
                                "search-update",
                                SearchUpdatePayload {
                                    search_id,
                                    results: search_results.clone(),
                                },
                            );
                        }
                        Err(err) => {
                            eprintln!("skip search item parse error: {err}");
                        }
                    }
                }
            }
            CommandEvent::Stderr(data_bytes) => {
                last_stderr.push_str(&String::from_utf8_lossy(&data_bytes));
            }
            _ => {}
        }
    }

    if let Ok(mut slot) = state.active_search.lock() {
        // Only clear if we still own the slot (a newer search may have replaced us).
        if state.active_search_id.load(Ordering::SeqCst) == search_id {
            *slot = None;
        }
    }

    if !is_current() {
        return Ok(());
    }

    let trailing = stdout_buf.trim();
    if !trailing.is_empty() {
        if let Ok(video) = serde_json::from_str::<Video>(trailing) {
            let processed_video = parse_video_details(video);
            let video_id = youtube_video_id(&processed_video.url);
            let already = search_results.iter().any(|v| {
                if let Some(id) = video_id.as_ref() {
                    youtube_video_id(&v.url).as_ref() == Some(id)
                } else {
                    !v.url.is_empty() && v.url == processed_video.url
                }
            });
            if !already {
                search_results.push(processed_video);
                let _ = app.emit(
                    "search-update",
                    SearchUpdatePayload {
                        search_id,
                        results: search_results.clone(),
                    },
                );
            }
        }
    }

    if search_results.is_empty() {
        return Err(AppError::with_detail(
            crate::errors::codes::NO_RESULTS,
            "No se encontraron resultados para esa búsqueda.",
            first_error_line(&last_stderr)
                .unwrap_or("ERROR: no search results")
                .to_string(),
        ));
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_url_details(
    app: tauri::AppHandle,
    url: String,
    cookies_file: Option<String>,
    cookies_from_browser: Option<String>,
) -> Result<Video, AppError> {
    let mut args = vec![
        url.clone(),
        "--dump-json".to_string(),
        "--no-playlist".to_string(),
    ];
    append_cookie_args_lenient(
        &mut args,
        cookies_file.as_deref(),
        cookies_from_browser.as_deref(),
    );
    let sidecar_command = app
        .shell()
        .command(binaries::resolve("yt-dlp").map_err(|e| {
            AppError::with_detail(
                crate::errors::codes::YTDLP_SPAWN,
                "No se pudo lanzar yt-dlp. Comprueba que esté disponible.",
                e,
            )
        })?)
        .args(args);

    let output = sidecar_command
        .output()
        .await
        .map_err(|e| {
            AppError::with_detail(
                crate::errors::codes::YTDLP_SPAWN,
                "yt-dlp falló al ejecutarse.",
                format!("{e}"),
            )
        })?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let exit_code = output.status.code();
    if !output.status.success() && output.stdout.is_empty() {
        return Err(format_ytdlp_error(
            &stderr,
            format!("yt-dlp failed for {url} (exit {:?})", exit_code),
        ));
    }
    if output.stdout.is_empty() {
        return Err(format_ytdlp_error(
            &stderr,
            format!("yt-dlp returned no data for {url}"),
        ));
    }
    let data = String::from_utf8_lossy(&output.stdout);
    let video: Video = serde_json::from_str::<Video>(&data).map_err(|e| {
        AppError::with_detail(
            crate::errors::codes::PARSE_JSON,
            "No se pudo interpretar la respuesta de YouTube.",
            format!("{e}"),
        )
    })?;

    Ok(parse_video_details(video))
}

// ---------------------------------------------------------------------------
// 7. Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DownloadConfig;

    fn audio_config() -> DownloadConfig {
        // Tests must not depend on the developer's CLIP_HARBOUR_COOKIES* values
        // (loaded from the root .env by setup-windows-env.ps1).
        let _ = std::env::remove_var("CLIP_HARBOUR_COOKIES");
        let _ = std::env::remove_var("CLIP_HARBOUR_COOKIES_FROM_BROWSER");
        DownloadConfig {
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ".into(),
            title: "Artist - Song".into(),
            output_dir: Some(r"C:\Music".into()),
            output_ext: Some("m4a".into()),
            format: None,
            proxy_url: None,
            embed_subtitles: Some(false),
            embed_metadata: Some(false),
            embed_thumbnail: Some(false),
            duration_raw: None,
            cookies_file: None,
            cookies_from_browser: None,
            purpose: None,
        }
    }

    #[test]
    fn audio_download_uses_title_filename_and_parses_artist() {
        let args = parse_config(audio_config()).expect("args");
        assert!(args.iter().any(|a| a == "%(track,title).200B.%(ext)s"));
        assert!(args.iter().any(|a| a == "--embed-metadata"));
        assert!(args.iter().any(|a| a == "--parse-metadata"));
        let parse = args
            .windows(2)
            .find(|w| {
                w[0] == "--parse-metadata"
                    && w[1].contains("?P<artist>")
                    && w[1].contains("?P<title>")
                    && w[1].contains("?P<album>")
            })
            .map(|w| w[1].as_str());
        assert!(
            parse.is_some(),
            "expected Artist - Title | Album parse rule"
        );
        assert!(
            args.windows(2)
                .any(|w| w[0] == "--replace-in-metadata" && w[1] == "title"),
            "expected title cleanup rules"
        );
    }

    #[test]
    fn player_cache_keeps_id_filename_without_audio_parse() {
        let mut cfg = audio_config();
        cfg.purpose = Some("cache".into());
        let args = parse_config(cfg).expect("args");
        assert!(args.iter().any(|a| a == "%(id)s.%(ext)s"));
        assert!(!args.iter().any(|a| a == "--parse-metadata"));
    }

    #[test]
    fn enrich_filters_and_dedupes_youtube_cookies() {
        // Raw cookie lines in Netscape format (domain, flag, path, secure, expiry, name, value).
        // Expiries en el futuro lejano (4102444800 = año 2100).
        let raw = [
            "# Netscape HTTP Cookie File",
            ".youtube.com\tTRUE\t/\tTRUE\t4102444800\tSID\tabc123",
            ".youtube.com\tTRUE\t/\tTRUE\t4102444801\tSID\tabc123", // newer expiry for same key
            ".google.com\tTRUE\t/\tTRUE\t4102444800\tNID\tsomeval",
            ".example.com\tTRUE\t/\tTRUE\t4102444800\tNOTY\tkeepme", // non-YT -> dropped
            "",
        ]
        .join("\n");

        let tmp_dir = std::env::temp_dir();
        let in_path = tmp_dir.join("clip_harbour_test_raw.txt");
        let out_path = tmp_dir.join("clip_harbour_test_merged.txt");
        std::fs::write(&in_path, &raw).expect("write raw");

        let count = enrich_cookies(&in_path.to_str().unwrap(), &out_path.to_str().unwrap(), None)
            .expect("enrich");
        assert_eq!(count, 2, "two unique YT/Google cookies after dedupe");

        let written = std::fs::read_to_string(&out_path).expect("read merged");
        assert!(!written.as_bytes().starts_with(&[0xEF, 0xBB, 0xBF]), "no BOM");
        assert!(!written.contains(".example.com"), "non-YT dropped");
        // Dedupe kept the newer expiry line.
        assert!(written.contains("4102444801"), "kept latest expiry");
        assert!(written.contains("# Source browser: desconocido"));

        let _ = std::fs::remove_file(&in_path);
        let _ = std::fs::remove_file(&out_path);
    }

    #[test]
    fn parse_cookie_line_normalizes_flags_and_detects_bom() {
        // Field with a leading UTF-8 BOM is stripped on the first field.
        let with_bom = format!("\u{FEFF}.youtube.com\tx\t/\tX\t0\tname\tvalue");
        let parsed = parse_cookie_line(&with_bom).expect("parse with BOM");
        assert_eq!(parsed.4, ".youtube.com\tTRUE\t/\tFALSE\t0\tname\tvalue");
    }

    #[test]
    fn truncate_utf8_never_splits_a_char() {
        // "á" is 2 bytes: cutting inside it must step back to a char boundary.
        assert_eq!(truncate_utf8("á", 1), "…"); // 1 byte would split "á"
        assert_eq!(truncate_utf8("abácd", 1), "a…"); // cut after 'a' is a valid boundary
        assert_eq!(truncate_utf8("abácd", 3), "ab…"); // 3 cuts the 2nd byte of á -> step back
        assert_eq!(truncate_utf8("abácd", 6), "abácd"); // 6 bytes = full length (á=2)
        assert_eq!(truncate_utf8("  short  ", 100), "short");
    }

    #[test]
    fn tail_utf8_keeps_whole_chars() {
        // Cut lands on the second byte of "á": the walk drops the partial char.
        let s = format!("á{}", "y".repeat(2999)); // len 3001
        assert_eq!(s.len(), 3001);
        assert_eq!(tail_utf8(&s, 3000), "y".repeat(2999));

        // Cut inside the ASCII run keeps the trailing multibyte chars intact.
        let long = format!("{}áñ", "x".repeat(4000));
        let tail = tail_utf8(&long, 3000);
        assert_eq!(tail.len(), 3000);
        assert!(tail.ends_with("áñ"));
    }

    #[test]
    fn is_auth_block_error_matches_yt_blocks() {
        assert!(is_auth_block_error("ERROR: unable to download: HTTP Error 403"));
        assert!(is_auth_block_error("Sign in to confirm you’re not a bot"));
        assert!(is_auth_block_error("ERROR: YouTube said: sign in to confirm you're not a bot"));
        assert!(!is_auth_block_error("ERROR: Unable to extract player response"));
        assert!(!is_auth_block_error("ERROR: unable to create directory: access denied"));
    }

    #[test]
    fn download_has_cookies_from_config_and_env() {
        let mut cfg = audio_config();
        cfg.cookies_file = Some(r"C:\c.txt".into());
        assert!(download_has_cookies(&cfg));
        cfg.cookies_file = None;
        std::env::remove_var("CLIP_HARBOUR_COOKIES");
        assert!(!download_has_cookies(&cfg));
        std::env::set_var("CLIP_HARBOUR_COOKIES", r"C:\c.txt");
        assert!(download_has_cookies(&cfg));
        std::env::remove_var("CLIP_HARBOUR_COOKIES");
    }

    #[test]
    fn append_cookie_args_strict_fails_on_missing_file() {
        std::env::remove_var("CLIP_HARBOUR_COOKIES");
        std::env::remove_var("CLIP_HARBOUR_COOKIES_FROM_BROWSER");
        let mut args = vec![];
        let err = append_cookie_args(&mut args, Some(r"C:\no-such-cookies.txt"), None);
        assert!(err.is_err());
        assert!(args.is_empty());
    }

    #[test]
    fn append_cookie_args_lenient_skips_missing_file() {
        std::env::remove_var("CLIP_HARBOUR_COOKIES");
        std::env::remove_var("CLIP_HARBOUR_COOKIES_FROM_BROWSER");
        let mut args = vec![];
        append_cookie_args_lenient(&mut args, Some(r"C:\no-such-cookies.txt"), None);
        assert!(args.is_empty());
    }

    #[test]
    fn sanitize_cookie_path_strips_bom_via_sibling_copy() {
        let tmp = std::env::temp_dir();
        let raw = tmp.join("clip_harbour_bom_test.txt");
        std::fs::write(&raw, "\u{FEFF}.youtube.com\tTRUE\t/\tTRUE\t0\tn\tv").unwrap();
        let clean = sanitize_cookie_path(raw.to_str().unwrap()).unwrap();
        assert!(clean.ends_with(".nobom.txt"));
        let content = std::fs::read(&clean).unwrap();
        assert!(!content.starts_with(&[0xEF, 0xBB, 0xBF]));
        let _ = std::fs::remove_file(&raw);
        let _ = std::fs::remove_file(&clean);
    }

    #[test]
    fn sanitize_cookie_path_returns_same_without_bom() {
        let tmp = std::env::temp_dir();
        let raw = tmp.join("clip_harbour_nobom_test.txt");
        std::fs::write(&raw, ".youtube.com\tTRUE\t/\tTRUE\t0\tn\tv").unwrap();
        let p = sanitize_cookie_path(raw.to_str().unwrap()).unwrap();
        assert_eq!(p, raw.to_str().unwrap());
        let _ = std::fs::remove_file(&raw);
    }

    #[test]
    fn tmp_cookie_name_detects_raw_jars_but_not_merged() {
        assert!(is_tmp_cookie_name(std::path::Path::new(
            "C:\\Users\\x\\cookies_youtube\\cookies_raw_firefox.txt"
        )));
        assert!(is_tmp_cookie_name(std::path::Path::new(
            "C:\\Users\\x\\cookies_youtube\\COOKIES_RAW_CHROME.TXT"
        )));
        assert!(!is_tmp_cookie_name(std::path::Path::new(
            "C:\\Users\\x\\cookies_youtube\\cookies_merged.txt"
        )));
        assert!(!is_tmp_cookie_name(std::path::Path::new(
            "C:\\Users\\x\\cookies_youtube\\cookies_chrome.txt"
        )));
    }

    #[test]
    fn cookies_file_valid_rejects_missing_and_temp() {
        let tmp = std::env::temp_dir();
        let real = tmp.join("clip_harbour_valid_cookies.txt");
        std::fs::write(&real, ".youtube.com\tTRUE\t/\tTRUE\t0\tn\tv").unwrap();
        let raw = tmp.join("cookies_raw_firefox.txt");
        std::fs::write(&raw, ".youtube.com\tTRUE\t/\tTRUE\t0\tn\tv").unwrap();

        assert!(cookies_file_valid(real.to_string_lossy().into_owned()));
        assert!(!cookies_file_valid(raw.to_string_lossy().into_owned()));
        assert!(!cookies_file_valid(tmp.join("no_existe.txt").to_string_lossy().into_owned()));
        assert!(!cookies_file_valid(String::new()));

        let _ = std::fs::remove_file(&real);
        let _ = std::fs::remove_file(&raw);
    }

    #[test]
    fn list_candidates_skips_raw_temp_jars() {
        let tmp = std::env::temp_dir().join("clip_harbour_candidates_test");
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("cookies_raw_firefox.txt"), "x").unwrap();
        std::fs::write(tmp.join("cookies_merged.txt"), "x").unwrap();
        std::fs::write(tmp.join("cookies_chrome.txt"), "x").unwrap();

        // The command needs an AppHandle; test the filter through a helper that
        // reuses the same skip logic on a plain directory listing.
        let names: Vec<String> = std::fs::read_dir(&tmp)
            .unwrap()
            .flatten()
            .filter(|e| e.path().is_file())
            .filter(|e| !is_tmp_cookie_name(&e.path()))
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(names.contains(&"cookies_merged.txt".to_string()));
        assert!(names.contains(&"cookies_chrome.txt".to_string()));
        assert!(!names.contains(&"cookies_raw_firefox.txt".to_string()));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn enrich_cookies_drops_expired_and_keeps_session() {
        // Una cookie caducada NO debe sobrevivir; la fresca con cookie de
        // sesión (SID) hace que el archivo sea válido.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let raw = format!(
            ".youtube.com\tTRUE\t/\tTRUE\t{}\tSID\texpired\n\
             .youtube.com\tTRUE\t/\tTRUE\t{}\tHSID\tfresh\n",
            now - 1000,
            now + 1000
        );
        let tmp = std::env::temp_dir();
        let in_path = tmp.join("clip_harbour_expired_in.txt");
        let out_path = tmp.join("clip_harbour_expired_out.txt");
        std::fs::write(&in_path, &raw).unwrap();
        let count =
            enrich_cookies(in_path.to_str().unwrap(), out_path.to_str().unwrap(), Some("firefox"))
                .unwrap();
        let written = std::fs::read_to_string(&out_path).unwrap();
        assert_eq!(count, 1, "solo la fresca sobrevive");
        assert!(!written.contains("expired"));
        assert!(written.contains("fresh"));
        assert!(written.contains("# Source browser: firefox"));
        let _ = std::fs::remove_file(&in_path);
        let _ = std::fs::remove_file(&out_path);
    }

    #[test]
    fn enrich_cookies_rejects_without_session_cookie() {
        // Sin cookie de sesión (SID/HSID) el jar NO es válido: error para que
        // refresh_cookies_all pruebe el siguiente navegador.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let raw = format!(".youtube.com\tTRUE\t/\tTRUE\t{}\tCONSENT\tyes\n", now + 1000);
        let tmp = std::env::temp_dir();
        let in_path = tmp.join("clip_harbour_nosession_in.txt");
        let out_path = tmp.join("clip_harbour_nosession_out.txt");
        std::fs::write(&in_path, &raw).unwrap();
        let err = enrich_cookies(in_path.to_str().unwrap(), out_path.to_str().unwrap(), Some("chrome"))
            .expect_err("debe fallar sin cookie de sesión");
        assert!(err.contains("sin sesión válida"), "error: {err}");
        let _ = std::fs::remove_file(&in_path);
        let _ = std::fs::remove_file(&out_path);
    }

    #[test]
    fn enrich_drops_expired_st_cookies_like_session_logininfo() {
        // Reproduce el caso real: varias ST-* (session_logininfo) caducadas
        // mezcladas con cookies de sesión frescas. Las ST-* NO deben sobrevivir.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let mut raw = String::new();
        for (i, name) in ["ST-l3hjtt", "ST-tladcw", "ST-xuwub9", "ST-yve142", "ST-3opvp5"]
            .iter()
            .enumerate()
        {
            raw.push_str(&format!(
                ".youtube.com\tTRUE\t/\tFALSE\t{}\t{name}\tsession_logininfo=…{}\n",
                now - (10_000 + i as i64),
                i
            ));
        }
        raw.push_str(&format!(
            ".youtube.com\tTRUE\t/\tFALSE\t{}\tSID\tg.a000Bwll.fresh\n",
            now + 1000
        ));
        raw.push_str(&format!(
            ".youtube.com\tTRUE\t/\tFALSE\t{}\tHSID\tfresh\n",
            now + 1000
        ));
        let tmp = std::env::temp_dir();
        let in_path = tmp.join("clip_harbour_st_in.txt");
        let out_path = tmp.join("clip_harbour_st_out.txt");
        std::fs::write(&in_path, &raw).unwrap();
        let count =
            enrich_cookies(in_path.to_str().unwrap(), out_path.to_str().unwrap(), Some("firefox"))
                .unwrap();
        let written = std::fs::read_to_string(&out_path).unwrap();
        assert_eq!(count, 2, "solo SID y HSID sobreviven");
        assert!(!written.contains("ST-"), "no debe quedar ninguna ST-*: {written}");
        assert!(written.contains("SID"));
        assert!(written.contains("HSID"));
        let _ = std::fs::remove_file(&in_path);
        let _ = std::fs::remove_file(&out_path);
    }

    #[test]
    fn prepare_cookie_file_drops_expired_but_keeps_session() {
        // La ruta MANUAL (Elegir cookies.txt / env) también debe descartar
        // cookies caducadas y conservar las de sesión, sin tocar el original.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let raw = format!(
            "# Netscape HTTP Cookie File\n\
             .youtube.com\tTRUE\t/\tTRUE\t{}\tSID\tfresh\n\
             .youtube.com\tTRUE\t/\tFALSE\t{}\tST-abc\tsession_logininfo=old\n\
             .youtube.com\tTRUE\t/\tFALSE\t0\tYSC\tsession\n",
            now + 1000,
            now - 1000,
        );
        let tmp = std::env::temp_dir();
        let in_path = tmp.join("clip_harbour_prepare_in.txt");
        std::fs::write(&in_path, &raw).unwrap();
        let usable = prepare_cookie_file(in_path.to_str().unwrap()).unwrap();
        let written = std::fs::read_to_string(&usable).unwrap();
        assert_ne!(usable, in_path.to_str().unwrap(), "debe crear un .clean.txt");
        assert!(written.contains("SID"));
        assert!(written.contains("YSC"), "session cookie (expiry 0) se conserva");
        assert!(!written.contains("ST-abc"), "caducada eliminada: {written}");
        // El original queda intacto.
        let original = std::fs::read_to_string(&in_path).unwrap();
        assert!(original.contains("ST-abc"));
        let _ = std::fs::remove_file(&in_path);
        let _ = std::fs::remove_file(&usable);
    }

    #[test]
    fn prepare_cookie_file_returns_same_path_when_nothing_expired() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let raw = format!(
            ".youtube.com\tTRUE\t/\tFALSE\t{}\tSID\tfresh\n",
            now + 1000
        );
        let tmp = std::env::temp_dir();
        let in_path = tmp.join("clip_harbour_prepare_ok.txt");
        std::fs::write(&in_path, &raw).unwrap();
        let usable = prepare_cookie_file(in_path.to_str().unwrap()).unwrap();
        assert_eq!(usable, in_path.to_str().unwrap());
        let _ = std::fs::remove_file(&in_path);
    }
}
