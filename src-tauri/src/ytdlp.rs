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
        args.push("--cookies".to_string());
        args.push(path);
    }
    if let Some(browser) = browser {
        args.push("--cookies-from-browser".to_string());
        args.push(browser);
    }
    Ok(())
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

    if let Some(ffmpeg) = ffmpeg_location() {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg);
    }

    if let Some(dir) = config.output_dir.filter(|x| !x.is_empty()) {
        args.push("-P".to_string());
        args.push(dir);
        args.push("-o".to_string());
        if config.purpose.as_deref() == Some("cache") {
            args.push("%(id)s.%(ext)s".to_string());
        } else {
            args.push("%(title).200B.%(ext)s".to_string());
        }
    }

    let is_cache = config.purpose.as_deref() == Some("cache");
    if let Some(format) = config.format.filter(|x| !x.is_empty()) {
        args.push("-f".to_string());
        args.push(format);
    } else if is_cache {
        args.push("-f".to_string());
        args.push("bv*[height<=720]+ba/b".to_string());
    } else {
        args.push("-f".to_string());
        args.push("bestaudio/best".to_string());
    }

    if is_cache {
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
    if config.embed_metadata == Some(true) {
        args.push("--embed-metadata".to_string());
    }
    if config.embed_thumbnail == Some(true) {
        args.push("--embed-thumbnail".to_string());
    }

    Ok(args)
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
