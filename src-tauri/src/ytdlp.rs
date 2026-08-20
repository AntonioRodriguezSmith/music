use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::Emitter;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::models::{parse_video_details, DownloadConfig, Video};
use crate::state::app_state;

pub fn ffmpeg_location() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let candidate = dir.join(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    if candidate.exists() {
        Some(candidate.to_string_lossy().into_owned())
    } else {
        None
    }
}

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
        // needed so exports straight from an extension keep working.
        let usable = sanitize_cookie_path(&path)?;
        args.push("--cookies".to_string());
        args.push(usable);
    }
    if let Some(browser) = browser {
        args.push("--cookies-from-browser".to_string());
        args.push(browser);
    }
    Ok(())
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

/// Resolve the cookies directory: an explicit `dir` argument (if any), else the
/// well-known per-user `%USERPROFILE%\cookies_youtube` folder, else
/// `CLIP_HARBOUR_COOKIES_DIR`. Shared by `list_cookie_candidates` and the
/// auto-refresh command so reading and writing always agree on the same folder.
fn resolve_cookies_dir(dir: Option<&str>) -> Result<String, String> {
    dir.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            let mut home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .ok()?;
            home.push_str("\\cookies_youtube");
            Some(home)
        })
        .or_else(|| std::env::var("CLIP_HARBOUR_COOKIES_DIR").ok())
        .ok_or_else(|| "No cookies directory to scan".to_string())
}

/// Scan a directory for candidate `cookies.txt` Netscape files.
/// Directory defaults to the well-known per-user `cookies_youtube` folder,
/// overridable via `CLIP_HARBOUR_COOKIES_DIR`.
///
/// Files saved with a UTF-8 BOM are still returned (they are automatically
/// stripped of the BOM when used; see `sanitize_cookie_path`). Ordered so the
/// most likely filenames ("cookies_merged", "cookies_chrome", …) come first.
#[tauri::command]
pub fn list_cookie_candidates(
    dir: Option<String>,
) -> Result<Vec<String>, String> {
    let root = resolve_cookies_dir(dir.as_deref())?;

    if !std::path::Path::new(&root).is_dir() {
        return Ok(vec![]);
    }

    let mut candidates = vec![];
    let entries =
        std::fs::read_dir(&root).map_err(|e| format!("read dir {root}: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
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

    let trimmed = root.trim_end_matches('\\');
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
/// expiry, and write a UTF-8 (no BOM) Netscape file at `out_path`. Returns the
/// number of cookies written. Falls back (no write) when none are kept.
fn enrich_cookies(raw_path: &str, out_path: &str) -> Result<usize, String> {
    use std::collections::HashMap;

    let content =
        std::fs::read_to_string(raw_path).map_err(|e| format!("read raw cookies: {e}"))?;

    let mut by_key: HashMap<String, (i64, String)> = HashMap::new();
    for line in content.lines() {
        if let Some((domain, path, name, expiry, normalized)) = parse_cookie_line(line) {
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
            "No YouTube/Google cookies kept. FireFox sin sesión? Inicia sesión en YouTube y reintenta.".to_string(),
        );
    }

    let mut lines: Vec<String> = vec![];
    lines.push("# Netscape HTTP Cookie File".to_string());
    lines.push(
        "# Auto-extracted and enriched for Clip Harbour / yt-dlp (YouTube + Google). UTF-8 no BOM."
            .to_string(),
    );
    lines.push(format!("# Source browser: Firefox (via --cookies-from-browser)"));
    let mut entries: Vec<&String> = by_key.values().map(|(_, l)| l).collect();
    entries.sort();
    lines.extend(entries.into_iter().cloned());

    std::fs::write(out_path, lines.join("\n"))
        .map_err(|e| format!("write merged cookies {out_path}: {e}"))?;
    Ok(by_key.len())
}

/// Auto-refresh cookies from the browser (default Firefox) and enrich them into
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
    let browser = browser.filter(|b| !b.is_empty()).unwrap_or_else(|| "firefox".to_string());
    let dir = resolve_cookies_dir(None)?;
    let dir_path = std::path::Path::new(&dir);
    if !dir_path.is_dir() {
        return Err(format!("Carpeta de cookies no encontrada: {dir}"));
    }

    let tmp = dir_path.join("cookies_raw.txt");
    let _ = std::fs::remove_file(&tmp);

    let tmp_str = tmp.to_string_lossy().into_owned();
    let extracted = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("yt-dlp sidecar: {e}"))?
        .args(["--cookies-from-browser", &browser, "--cookies", &tmp_str])
        .output()
        .await;

    // Exit status is unreliable (non-zero even on success); validate the file.
    if extracted.is_err() && !tmp.is_file() {
        return Err(format!(
            "No se pudo extraer cookies del navegador ({browser}). Verifica que Firefox esté instalado."
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
    let count = enrich_cookies(&tmp_str, &out_str)?;
    let _ = std::fs::remove_file(&tmp);

    eprintln!("refresh_cookies: wrote {count} cookies to {out_str}");
    Ok(out_str)
}

fn first_error_line(stderr: &str) -> Option<&str> {
    stderr.lines().find(|line| {
        let t = line.trim();
        t.starts_with("ERROR:") || t.contains("ERROR:")
    })
}

/// Keep UI messages short: drop yt-dlp WARNING spam, keep the actionable cause.
pub fn format_ytdlp_error(stderr: &str, fallback: String) -> String {
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        return fallback;
    }
    if trimmed.contains("does not look like a Netscape format cookies file")
        || (trimmed.contains("skipping cookie file entry") && trimmed.contains("User-agent:"))
    {
        let path_hint = first_error_line(trimmed).unwrap_or(
            "ERROR: cookies file does not look like a Netscape format cookies file",
        );
        return format!(
            "{path_hint}\n\n\
El archivo de cookies no es válido (parece el texto de youtube.com/robots.txt, no cookies Netscape).\n\
Exporta cookies reales con una extensión (p. ej. \"Get cookies.txt LOCALLY\") tras iniciar sesión \
en YouTube en ventana privada, elige ese archivo en la sidebar y vuelve a buscar.\n\
Ver docs/PHASE2_SETUP.md"
        );
    }
    if trimmed.contains("rate-limited")
        || trimmed.contains("rate limited")
        || (trimmed.contains("isn't available, try again later")
            && trimmed.contains("YouTube"))
    {
        let head = first_error_line(trimmed)
            .unwrap_or("ERROR: YouTube rate limit");
        return format!(
            "{head}\n\n\
YouTube ha limitado esta sesión (hasta ~1 hora). Espera un rato, evita lanzar varios \
vídeos seguidos y vuelve a intentarlo. La app ahora añade pausas entre peticiones."
        );
    }
    if trimmed.contains("Sign in to confirm") || trimmed.contains("not a bot") {
        let head = first_error_line(trimmed).unwrap_or("ERROR: Sign in to confirm you're not a bot");
        return format!(
            "{head}\n\n\
Exporta cookies YouTube (cookies.txt) y configúralas en la sidebar. Ver docs/PHASE2_SETUP.md"
        );
    }
    // Prefer a single ERROR line over dumping all WARNINGs.
    if let Some(err) = first_error_line(trimmed) {
        return err.trim().to_string();
    }
    // Cap residual stderr so the search UI cannot fill with noise.
    const MAX: usize = 400;
    if trimmed.len() > MAX {
        format!("{}…", &trimmed[..MAX])
    } else {
        trimmed.to_string()
    }
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

#[tauri::command(rename_all = "snake_case")]
pub async fn get_ytdlp_version(app: tauri::AppHandle) -> Result<String, String> {
    let sidecar_command = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("yt-dlp sidecar: {e}"))?
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

#[tauri::command(rename_all = "snake_case")]
pub async fn get_top_search(
    app: tauri::AppHandle,
    query: String,
    cookies_file: Option<String>,
    cookies_from_browser: Option<String>,
    search_id: Option<u64>,
    // ytsearchN size (default 50, max 100)
    limit: Option<u32>,
) -> Result<(), String> {
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
    append_cookie_args(
        &mut args,
        cookies_file.as_deref(),
        cookies_from_browser.as_deref(),
    )?;
    let sidecar_command = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("yt-dlp sidecar: {e}"))?
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
        return Err(format_ytdlp_error(
            &last_stderr,
            "No search results. Try another query (or set YouTube cookies).".to_string(),
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
) -> Result<Video, String> {
    let mut args = vec![
        url.clone(),
        "--dump-json".to_string(),
        "--no-playlist".to_string(),
    ];
    append_cookie_args(
        &mut args,
        cookies_file.as_deref(),
        cookies_from_browser.as_deref(),
    )?;
    let sidecar_command = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("yt-dlp sidecar: {e}"))?
        .args(args);

    let output = sidecar_command
        .output()
        .await
        .map_err(|e| format!("yt-dlp failed: {e}"))?;
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
        format!("Failed to parse yt-dlp JSON: {e}")
    })?;

    Ok(parse_video_details(video))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DownloadConfig;

    fn audio_config() -> DownloadConfig {
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
        let raw = [
            "# Netscape HTTP Cookie File",
            ".youtube.com\tTRUE\t/\tTRUE\t1750000000\tSID\tabc123",
            ".youtube.com\tTRUE\t/\tTRUE\t9999999999\tSID\tabc123", // newer expiry for same key
            ".google.com\tTRUE\t/\tTRUE\t1750000000\tNID\tsomeval",
            ".example.com\tTRUE\t/\tTRUE\t1750000000\tNOTY\tkeepme", // non-YT -> dropped
            "",
        ]
        .join("\n");

        let tmp_dir = std::env::temp_dir();
        let in_path = tmp_dir.join("clip_harbour_test_raw.txt");
        let out_path = tmp_dir.join("clip_harbour_test_merged.txt");
        std::fs::write(&in_path, &raw).expect("write raw");

        let count = enrich_cookies(&in_path.to_str().unwrap(), &out_path.to_str().unwrap())
            .expect("enrich");
        assert_eq!(count, 2, "two unique YT/Google cookies after dedupe");

        let written = std::fs::read_to_string(&out_path).expect("read merged");
        assert!(!written.as_bytes().starts_with(&[0xEF, 0xBB, 0xBF]), "no BOM");
        assert!(!written.contains(".example.com"), "non-YT dropped");
        // Dedupe kept the newer expiry line.
        assert!(written.contains("9999999999"), "kept latest expiry");

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
}
