use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::{MutexGuard, PoisonError};

use tauri::Emitter;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::time::{sleep, Duration};

use crate::models::{Download, DownloadConfig};
use crate::state::{app_state, AppState, MAX_PARALLEL_DOWNLOADS, PROCESS_COUNTER};
use crate::ytdlp::{
    download_has_cookies, format_ytdlp_error, is_auth_block_error, parse_config,
};

fn lock_process_registry(
    state: &AppState,
) -> MutexGuard<'_, HashMap<usize, CommandChild>> {
    state
        .process_registry
        .lock()
        .unwrap_or_else(|poisoned: PoisonError<MutexGuard<'_, HashMap<usize, CommandChild>>>| {
            eprintln!("process_registry lock poisoned; recovering");
            poisoned.into_inner()
        })
}

fn truncate_cli_detail(raw: &str, max: usize) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let flat: String = trimmed
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");
    if flat.len() > max {
        format!("{}…", &flat[..max])
    } else {
        flat
    }
}

fn clamp_pct(value: f64) -> f64 {
    value.max(0.0).min(100.0)
}

fn parse_pct_str(value: &str) -> Option<f64> {
    value.trim().trim_end_matches('%').trim().parse().ok()
}

fn map_download_pct(raw: f64, will_convert: bool) -> f64 {
    if will_convert {
        clamp_pct(raw * 0.7)
    } else {
        clamp_pct(raw)
    }
}

fn map_convert_pct(raw: f64) -> f64 {
    clamp_pct(70.0 + raw * 0.3)
}

fn format_pct(value: f64) -> String {
    format!("{:.0}%", value)
}

fn merge_ytdlp_progress(entry: &mut Download, incoming: Download, will_convert: bool) {
    // Never trust yt-dlp's `status` field (often "finished" mid-pipeline).
    if let Some(filename) = incoming.filename {
        entry.filename = Some(filename);
    }
    if let Some(pct) = incoming.percentage.as_deref().and_then(parse_pct_str) {
        entry.percentage = Some(format_pct(map_download_pct(pct, will_convert)));
    }
    if incoming.speed.is_some() {
        entry.speed = incoming.speed;
    }
    if incoming.eta.is_some() {
        entry.eta = incoming.eta;
    }
    if incoming.bytes_downloaded.is_some() {
        entry.bytes_downloaded = incoming.bytes_downloaded;
    }
    if incoming.file_size.is_some() {
        entry.file_size = incoming.file_size;
    }
    if entry.status == "starting" || entry.status.is_empty() {
        entry.status = "downloading".to_string();
    }
}

fn resolve_download_path(filename: &str, output_dir: Option<&str>) -> String {
    use std::path::{Path, PathBuf};

    let path = Path::new(filename);
    if path.is_absolute() {
        return filename.to_string();
    }
    if cfg!(windows) && filename.len() >= 2 && filename.as_bytes()[1] == b':' {
        return filename.to_string();
    }
    if let Some(dir) = output_dir.filter(|d| !d.is_empty()) {
        return PathBuf::from(dir)
            .join(filename)
            .to_string_lossy()
            .into_owned();
    }
    filename.to_string()
}

fn remove_source_after_conversion(input_path: &str, output_path: &str) {
    use std::path::Path;

    if input_path != output_path {
        let _ = std::fs::remove_file(input_path);
    }

    let input = Path::new(input_path);
    let Some(stem) = input.file_stem().and_then(|s| s.to_str()) else {
        return;
    };
    let parent = input.parent().unwrap_or_else(|| Path::new("."));

    for ext in ["webm", "opus", "ogg", "m4a.part", "webm.part"] {
        let candidate = parent.join(format!("{stem}.{ext}"));
        let candidate_str = candidate.to_string_lossy();
        if candidate_str != output_path && candidate.is_file() {
            let _ = std::fs::remove_file(&candidate);
        }
    }
}

pub fn is_busy_status(status: &str) -> bool {
    matches!(
        status,
        "starting" | "downloading" | "downloaded" | "converting" | "retrying"
    )
}

fn count_busy_downloads(registry: &HashMap<usize, Download>) -> usize {
    registry
        .values()
        .filter(|d| is_busy_status(&d.status))
        .count()
}

#[tauri::command(rename_all = "snake_case")]
pub fn start_download(app: tauri::AppHandle, config: DownloadConfig) -> Result<usize, String> {
    let process_id = PROCESS_COUNTER.fetch_add(1, Ordering::Relaxed);

    tauri::async_runtime::spawn(async move {
        let state = app_state(&app);
        let queue_it = {
            let mut download_registry = state.download_registry.lock().await;
            let busy = count_busy_downloads(&download_registry);
            let queue_it = busy >= MAX_PARALLEL_DOWNLOADS;
            download_registry.insert(
                process_id,
                Download {
                    title: config.title.clone(),
                    status: if queue_it {
                        "queued".to_string()
                    } else {
                        "starting".to_string()
                    },
                    ..Default::default()
                },
            );
            let _ = app.emit("status", download_registry.clone());
            queue_it
        };

        if queue_it {
            let mut pending = state.pending_downloads.lock().await;
            pending.push_back((process_id, config));
            return;
        }

        run_download(app, process_id, config).await;
    });

    Ok(process_id)
}

async fn take_next_pending(app: &tauri::AppHandle) -> Option<(usize, DownloadConfig)> {
    let state = app_state(app);
    let busy = {
        let registry = state.download_registry.lock().await;
        count_busy_downloads(&registry)
    };
    if busy >= MAX_PARALLEL_DOWNLOADS {
        return None;
    }

    let next = {
        let mut pending = state.pending_downloads.lock().await;
        pending.pop_front()
    };
    let (process_id, config) = next?;

    {
        let mut registry = state.download_registry.lock().await;
        if !registry.contains_key(&process_id) {
            return None;
        }
        if let Some(entry) = registry.get_mut(&process_id) {
            entry.status = "starting".to_string();
        }
        let _ = app.emit("status", registry.clone());
    }

    Some((process_id, config))
}

fn schedule_pending(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Gap between queued jobs only (not before the first). soft=2s, strict=4s.
        let sleep_mode = std::env::var("CLIP_HARBOUR_YT_SLEEP")
            .unwrap_or_else(|_| "soft".into())
            .to_ascii_lowercase();
        let gap_secs = if sleep_mode == "strict" { 4 } else { 2 };
        sleep(Duration::from_secs(gap_secs)).await;
        if let Some((process_id, config)) = take_next_pending(&app).await {
            run_download(app, process_id, config).await;
        }
    });
}

async fn set_download_status(
    app: &tauri::AppHandle,
    process_id: usize,
    title: &str,
    status: String,
) {
    let state = app_state(app);
    let snapshot = {
        let mut download_registry = state.download_registry.lock().await;
        download_registry.insert(
            process_id,
            Download {
                title: title.to_string(),
                status,
                ..Default::default()
            },
        );
        download_registry.clone()
    };
    let _ = app.emit("status", snapshot);
}

/// One yt-dlp attempt. Returns true if caller should stop (success, cancel, or fatal error already set).
async fn run_ytdlp_attempt(
    app: &tauri::AppHandle,
    process_id: usize,
    config: &DownloadConfig,
) -> Result<(), String> {
    let state = app_state(app);
    let args = parse_config(config.clone())?;
    #[cfg(debug_assertions)]
    eprintln!("yt-dlp args: {args:?}");

    let sidecar_command = match app.shell().sidecar("yt-dlp") {
        Ok(cmd) => cmd.args(args),
        Err(e) => {
            return Err(format!("error:yt-dlp sidecar: {e}"));
        }
    };

    let (mut rx, child) = match sidecar_command.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            return Err(format!("error: Failed to spawn yt-dlp: {e}"));
        }
    };

    lock_process_registry(&state).insert(process_id, child);

    {
        let mut download_registry = state.download_registry.lock().await;
        download_registry.insert(
            process_id,
            Download {
                title: config.title.clone(),
                status: "starting".to_string(),
                ..Default::default()
            },
        );
        let _ = app.emit("status", download_registry.clone());
    }

    let mut last_error_line = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(data_bytes) | CommandEvent::Stderr(data_bytes) => {
                let data = String::from_utf8_lossy(&data_bytes);
                let line = data.trim();
                if line.is_empty() {
                    continue;
                }

                if let Ok(incoming) = serde_json::from_str::<Download>(line) {
                    let will_convert = config.output_ext.is_some();
                    let snapshot = {
                        let mut download_registry = state.download_registry.lock().await;
                        if let Some(entry) = download_registry.get_mut(&process_id) {
                            if entry.status == "cancelled" {
                                break;
                            }
                            entry.title = config.title.clone();
                            merge_ytdlp_progress(entry, incoming, will_convert);
                        } else {
                            break;
                        }
                        download_registry.clone()
                    };
                    let _ = app.emit("status", snapshot);
                } else if line.contains("ERROR") || line.contains("error") {
                    eprintln!("yt-dlp: {line}");
                    last_error_line = line.to_string();
                    let snapshot = {
                        let mut download_registry = state.download_registry.lock().await;
                        if let Some(entry) = download_registry.get_mut(&process_id) {
                            if entry.status != "cancelled" {
                                entry.status = format!("error: {line}");
                            }
                        }
                        download_registry.clone()
                    };
                    let _ = app.emit("status", snapshot);
                }
            }
            CommandEvent::Terminated(payload) => {
                let code = payload.code.unwrap_or(-1);
                let snapshot = {
                    let mut download_registry = state.download_registry.lock().await;
                    if let Some(entry) = download_registry.get_mut(&process_id) {
                        if entry.status != "cancelled"
                            && !entry.status.starts_with("error")
                            && entry.status != "converting"
                        {
                            entry.status = if code == 0 {
                                if config.output_ext.is_some() {
                                    entry.percentage = Some("70%".to_string());
                                    "downloaded".to_string()
                                } else {
                                    entry.percentage = Some("100%".to_string());
                                    "finished".to_string()
                                }
                            } else if !last_error_line.is_empty() {
                                format!("error: {last_error_line}")
                            } else {
                                format!("error (exit {code})")
                            };
                        }
                    }
                    download_registry.clone()
                };
                let _ = app.emit("status", snapshot);
            }
            _ => {}
        }
    }

    lock_process_registry(&state).remove(&process_id);

    let status = {
        let download_registry = state.download_registry.lock().await;
        download_registry
            .get(&process_id)
            .map(|d| d.status.clone())
            .unwrap_or_default()
    };

    if status == "cancelled" {
        return Ok(());
    }
    if status == "downloaded" || status == "finished" {
        return Ok(());
    }
    if status.starts_with("error") {
        return Err(status);
    }
    Err(format!("error: unexpected status {status}"))
}

async fn run_download(app: tauri::AppHandle, process_id: usize, config: DownloadConfig) {
    let max_attempts = if download_has_cookies(&config) { 3 } else { 1 };
    let backoff_ms = [0u64, 2000, 5000];

    for attempt in 0..max_attempts {
        if attempt > 0 {
            set_download_status(
                &app,
                process_id,
                &config.title,
                "retrying".to_string(),
            )
            .await;
            let delay = backoff_ms.get(attempt).copied().unwrap_or(5000);
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            let cancelled = {
                let state = app_state(&app);
                let registry = state.download_registry.lock().await;
                registry
                    .get(&process_id)
                    .map(|d| d.status == "cancelled")
                    .unwrap_or(true)
            };
            if cancelled {
                schedule_pending(app);
                return;
            }
        }

        match run_ytdlp_attempt(&app, process_id, &config).await {
            Ok(()) => break,
            Err(err) => {
                let cancelled = {
                    let state = app_state(&app);
                    let registry = state.download_registry.lock().await;
                    registry
                        .get(&process_id)
                        .map(|d| d.status == "cancelled")
                        .unwrap_or(false)
                };
                if cancelled {
                    schedule_pending(app);
                    return;
                }
                let can_retry = is_auth_block_error(&err) && attempt + 1 < max_attempts;
                if can_retry {
                    continue;
                }
                let final_status = if is_auth_block_error(&err) {
                    format_ytdlp_error(&err, err.clone())
                } else {
                    err
                };
                let status = if final_status.starts_with("error") {
                    final_status
                } else {
                    format!("error: {final_status}")
                };
                set_download_status(&app, process_id, &config.title, status).await;
                schedule_pending(app);
                return;
            }
        }
    }

    let convert_job = {
        let state = app_state(&app);
        let download_registry = state.download_registry.lock().await;
        download_registry.get(&process_id).and_then(|download| {
            // Player cache/keep: yt-dlp already merges (--merge-output-format); never re-encode.
            if matches!(
                config.purpose.as_deref(),
                Some("cache") | Some("keep") | Some("playlist")
            ) {
                return None;
            }
            let output_ext = config.output_ext.as_ref()?;
            if download.status != "downloaded" {
                return None;
            }
            let filename = download.filename.as_ref()?;
            let input_path = resolve_download_path(filename, config.output_dir.as_deref());
            let output_path = format!(
                "{}.{}",
                input_path
                    .rsplit_once('.')
                    .map(|(name, _)| name)
                    .unwrap_or(&input_path),
                output_ext
            );
            Some((
                input_path,
                output_path,
                config.duration_raw.unwrap_or(0.0),
                config.title.clone(),
            ))
        })
    };

    if let Some((input_path, output_path, duration_clone, title)) = convert_job {
        convert_video(
            app.clone(),
            input_path,
            output_path,
            process_id,
            duration_clone,
            title,
        )
        .await;
    }

    schedule_pending(app);
}

fn parse_time_to_seconds(time_str: &str) -> f64 {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 3 {
        return 0.0;
    }
    let hours: f64 = parts[0].parse().unwrap_or(0.0);
    let minutes: f64 = parts[1].parse().unwrap_or(0.0);
    let seconds: f64 = parts[2].parse().unwrap_or(0.0);
    hours * 3600.0 + minutes * 60.0 + seconds
}

fn ffmpeg_convert_args(input_path: &str, output_path: &str) -> Vec<String> {
    let ext = output_path.rsplit('.').next().unwrap_or("").to_lowercase();
    let mut args = vec!["-i".to_string(), input_path.to_string(), "-y".to_string()];

    match ext.as_str() {
        "m4a" | "aac" => {
            args.push("-vn".to_string());
            args.push("-c:a".to_string());
            args.push("aac".to_string());
            args.push("-b:a".to_string());
            args.push("256k".to_string());
        }
        "mp3" => {
            args.push("-vn".to_string());
            args.push("-c:a".to_string());
            args.push("libmp3lame".to_string());
            args.push("-q:a".to_string());
            args.push("0".to_string());
        }
        _ => {}
    }

    // Keep yt-dlp --embed-metadata tags (title / artist / album) through re-encode.
    // map_metadata copies into MP4 atoms (M4A) / ID3 (MP3) that BMW iDrive indexes.
    args.push("-map_metadata".to_string());
    args.push("0".to_string());
    if matches!(ext.as_str(), "mp3") {
        args.push("-id3v2_version".to_string());
        args.push("3".to_string());
        args.push("-write_id3v1".to_string());
        args.push("1".to_string());
    }
    args.push(output_path.to_string());
    args.push("-progress".to_string());
    args.push("pipe:1".to_string());
    args.push("-v".to_string());
    args.push("quiet".to_string());
    args
}

async fn convert_video(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    process_id: usize,
    duration: f64,
    title: String,
) {
    let state = app_state(&app);

    {
        let download_registry = state.download_registry.lock().await;
        if let Some(entry) = download_registry.get(&process_id) {
            if entry.status == "cancelled" || entry.status.starts_with("error") {
                return;
            }
        } else {
            return;
        }
    }

    let args = ffmpeg_convert_args(&input_path, &output_path);
    let sidecar_command = match app.shell().sidecar("ffmpeg") {
        Ok(cmd) => cmd.args(args),
        Err(e) => {
            eprintln!("ffmpeg sidecar: {e}");
            let snapshot = {
                let mut download_registry = state.download_registry.lock().await;
                if let Some(entry) = download_registry.get_mut(&process_id) {
                    entry.status = format!("error:ffmpeg sidecar: {e}");
                }
                download_registry.clone()
            };
            let _ = app.emit("status", snapshot);
            return;
        }
    };

    let (mut rx, child) = match sidecar_command.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("failed ffmpeg spawn: {e}");
            let snapshot = {
                let mut download_registry = state.download_registry.lock().await;
                if let Some(entry) = download_registry.get_mut(&process_id) {
                    entry.status = format!("error:ffmpeg spawn: {e}");
                }
                download_registry.clone()
            };
            let _ = app.emit("status", snapshot);
            return;
        }
    };

    lock_process_registry(&state).insert(process_id, child);

    let snapshot = {
        let mut download_registry = state.download_registry.lock().await;
        if let Some(entry) = download_registry.get_mut(&process_id) {
            entry.status = "converting".to_string();
            entry.percentage = Some("70%".to_string());
            entry.title = title.clone();
        }
        download_registry.clone()
    };
    let _ = app.emit("status", snapshot);

    let mut conversion_ok = false;
    let mut cancelled = false;
    let mut ffmpeg_stderr = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line_bytes) => {
                {
                    let download_registry = state.download_registry.lock().await;
                    if let Some(entry) = download_registry.get(&process_id) {
                        if entry.status == "cancelled" {
                            cancelled = true;
                            break;
                        }
                    } else {
                        cancelled = true;
                        break;
                    }
                }

                let log = String::from_utf8_lossy(&line_bytes);
                if log.contains("out_time=") {
                    let line = log.trim();
                    if let Some(time_str) = line.strip_prefix("out_time=") {
                        let current_time = parse_time_to_seconds(time_str.trim());
                        let progress = if duration > 0.0 {
                            clamp_pct((current_time / duration) * 100.0)
                        } else {
                            0.0
                        };

                        let snapshot = {
                            let mut download_registry = state.download_registry.lock().await;
                            if let Some(entry) = download_registry.get_mut(&process_id) {
                                entry.percentage = Some(format_pct(map_convert_pct(progress)));
                                entry.title = title.clone();
                            } else {
                                break;
                            }
                            download_registry.clone()
                        };
                        let _ = app.emit("status", snapshot);
                    }
                }

                if log.contains("progress=end") {
                    conversion_ok = true;
                }
            }
            CommandEvent::Stderr(line_bytes) => {
                let log = String::from_utf8_lossy(&line_bytes);
                ffmpeg_stderr.push_str(&log);
                if ffmpeg_stderr.len() > 4000 {
                    ffmpeg_stderr = ffmpeg_stderr[ffmpeg_stderr.len() - 3000..].to_string();
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code.unwrap_or(-1) == 0 {
                    conversion_ok = true;
                }
            }
            _ => {}
        }
    }

    lock_process_registry(&state).remove(&process_id);

    if cancelled {
        return;
    }

    let output_valid = {
        use std::path::Path;
        Path::new(&output_path)
            .metadata()
            .map(|m| m.is_file() && m.len() > 0)
            .unwrap_or(false)
    };

    if output_valid {
        conversion_ok = true;
    }

    if conversion_ok && output_valid {
        remove_source_after_conversion(&input_path, &output_path);

        let snapshot = {
            let mut download_registry = state.download_registry.lock().await;
            if let Some(entry) = download_registry.get_mut(&process_id) {
                if entry.status == "cancelled" {
                    return;
                }
                entry.title = title.clone();
                entry.filename = Some(output_path.clone());
                entry.percentage = Some("100%".to_string());
                entry.status = "finished".to_string();
            }
            download_registry.clone()
        };
        let _ = app.emit("status", snapshot);
        println!("ffmpeg conversion completed: {}", output_path);
    } else {
        let detail = truncate_cli_detail(&ffmpeg_stderr, 280);
        let status = if detail.is_empty() {
            "error:conversion".to_string()
        } else {
            format!("error:conversion: {detail}")
        };
        let snapshot = {
            let mut download_registry = state.download_registry.lock().await;
            if let Some(entry) = download_registry.get_mut(&process_id) {
                if entry.status == "cancelled" {
                    return;
                }
                entry.title = title.clone();
                entry.status = status;
            }
            download_registry.clone()
        };
        let _ = app.emit("status", snapshot);
        eprintln!(
            "ffmpeg conversion failed (ok={}, valid={}): {} — {}",
            conversion_ok, output_valid, output_path, detail
        );
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn stop_download(app: tauri::AppHandle, id: usize) {
    let state = app_state(&app);

    {
        let mut pending = state.pending_downloads.lock().await;
        pending.retain(|(pid, _)| *pid != id);
    }

    if let Some(handle) = lock_process_registry(&state).remove(&id) {
        if let Err(e) = handle.kill() {
            eprintln!("failed to kill process {id}: {e}");
        }
    }

    {
        let mut download_registry = state.download_registry.lock().await;
        if let Some(entry) = download_registry.get_mut(&id) {
            entry.status = "cancelled".to_string();
        }
        let _ = app.emit("status", download_registry.clone());
    }

    sleep(Duration::from_secs(5)).await;

    {
        let mut download_registry = state.download_registry.lock().await;
        download_registry.remove(&id);
        let _ = app.emit("status", download_registry.clone());
    }

    schedule_pending(app);
}

#[tauri::command(rename_all = "snake_case")]
pub async fn clear_finished_downloads(app: tauri::AppHandle) {
    let state = app_state(&app);
    let snapshot = {
        let mut download_registry = state.download_registry.lock().await;
        download_registry.retain(|_, d| {
            d.status != "finished" && d.status != "cancelled" && !d.status.starts_with("error")
        });
        download_registry.clone()
    };
    let _ = app.emit("status", snapshot);
}

#[tauri::command]
pub async fn pause_download(app: tauri::AppHandle, id: usize) -> Result<(), String> {
    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        let state = app_state(&app);
        let process_registry = lock_process_registry(&state);

        let handle = process_registry
            .get(&id)
            .ok_or_else(|| format!("process {id} not found"))?;
        let pid = Pid::from_raw(handle.pid() as i32);
        kill(pid, Signal::SIGTSTP).map_err(|e| format!("Failed to send pause signal: {e}"))?;
        drop(process_registry);

        let mut download_registry = state.download_registry.lock().await;
        download_registry
            .get_mut(&id)
            .ok_or_else(|| format!("download {id} not found"))?
            .status = "paused".to_string();
        let _ = app.emit("status", download_registry.clone());
        Ok(())
    }

    #[cfg(not(unix))]
    {
        let _ = (app, id);
        Err("pause_download is not supported on this platform".to_string())
    }
}

#[tauri::command]
pub async fn resume_download(app: tauri::AppHandle, id: usize) -> Result<(), String> {
    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        let state = app_state(&app);
        let process_registry = lock_process_registry(&state);

        let handle = process_registry
            .get(&id)
            .ok_or_else(|| format!("process {id} not found"))?;
        let pid = Pid::from_raw(handle.pid() as i32);
        kill(pid, Signal::SIGCONT).map_err(|e| format!("Failed to send resume signal: {e}"))?;
        drop(process_registry);

        let mut download_registry = state.download_registry.lock().await;
        if let Some(entry) = download_registry.get_mut(&id) {
            entry.status = "downloading".to_string();
        }
        let _ = app.emit("status", download_registry.clone());
        Ok(())
    }

    #[cfg(not(unix))]
    {
        let _ = (app, id);
        Err("resume_download is not supported on this platform".to_string())
    }
}
