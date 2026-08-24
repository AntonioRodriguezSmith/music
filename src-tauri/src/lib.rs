mod binaries;
mod models;
mod errors;
#[cfg(debug_assertions)]
mod player_cache;
mod queue;
mod state;
mod ytdlp;

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use tauri::async_runtime::Mutex;
use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size};
use tauri_plugin_shell::process::CommandChild;

use models::Download;
#[cfg(debug_assertions)]
use player_cache::{
    append_playlist_archive, clear_player_cache, clear_playlist_media, delete_player_cache_file,
    delete_playlist_dir, delete_playlist_file, list_playlist_video_ids, player_cache_dir,
    player_keep_dir, playlist_dir, promote_to_playlist, prune_player_cache, purge_player_cache,
    rename_playlist_dir, resolve_player_cache_file, resolve_playlist_file,
};
use queue::{
    clear_finished_downloads, pause_download, resume_download, start_download, stop_download,
};
use state::AppState;
use ytdlp::{
    cancel_search, cookies_dir, cookies_file_valid, get_top_search, get_url_details,
    get_ytdlp_version, list_cookie_candidates, refresh_cookies, refresh_cookies_all,
    resolve_download_dir,
};

/// Dev-only: appends a webview console message to `scripts\devtools\logs\console`.
/// Registered only under `#[cfg(debug_assertions)]` via the invoke handler.
#[cfg(debug_assertions)]
#[tauri::command]
fn devtools_log(level: String, line: String) -> Result<(), String> {
    let Some(root) = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent() else {
        return Err("cannot resolve repo root".into());
    };
    let dir = root.join("scripts").join("devtools").join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("console");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    let line = line.replace('\r', " ").replace('\n', " | ");
    writeln!(file, "[{level}] {line}").map_err(|e| e.to_string())
}

/// Open at 75% of the current monitor, centered (not maximized/fullscreen).
fn size_main_window_to_monitor(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let msize = monitor.size();
    let mpos = monitor.position();
    let width = ((msize.width as f64) * 0.75).round().max(1.0) as u32;
    let height = ((msize.height as f64) * 0.75).round().max(1.0) as u32;
    let _ = window.unmaximize();
    let _ = window.set_size(Size::Physical(PhysicalSize::new(width, height)));
    let x = mpos.x + ((msize.width as i32 - width as i32) / 2);
    let y = mpos.y + ((msize.height as i32 - height as i32) / 2);
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            if let Err(e) = binaries::ensure() {
                eprintln!("binaries::ensure: {e}");
            }
            app.manage(AppState {
                process_registry: Arc::new(std::sync::Mutex::new(HashMap::<usize, CommandChild>::new())),
                download_registry: Arc::new(Mutex::new(HashMap::<usize, Download>::new())),
                pending_downloads: Arc::new(Mutex::new(VecDeque::new())),
                active_search: Arc::new(std::sync::Mutex::new(None)),
                active_search_id: Arc::new(AtomicU64::new(0)),
            });
            size_main_window_to_monitor(app);
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            start_download,
            stop_download,
            pause_download,
            get_top_search,
            cancel_search,
            get_url_details,
            resume_download,
            clear_finished_downloads,
            get_ytdlp_version,
            list_cookie_candidates,
            cookies_dir,
            cookies_file_valid,
            refresh_cookies,
            refresh_cookies_all,
            resolve_download_dir,
            #[cfg(debug_assertions)]
            devtools_log,
            // Debug-only helpers (imports behind #[cfg(debug_assertions)] above).
            #[cfg(debug_assertions)]
            player_cache_dir,
            #[cfg(debug_assertions)]
            player_keep_dir,
            #[cfg(debug_assertions)]
            playlist_dir,
            #[cfg(debug_assertions)]
            resolve_playlist_file,
            #[cfg(debug_assertions)]
            list_playlist_video_ids,
            #[cfg(debug_assertions)]
            clear_playlist_media,
            #[cfg(debug_assertions)]
            append_playlist_archive,
            #[cfg(debug_assertions)]
            promote_to_playlist,
            #[cfg(debug_assertions)]
            delete_playlist_file,
            #[cfg(debug_assertions)]
            delete_playlist_dir,
            #[cfg(debug_assertions)]
            rename_playlist_dir,
            #[cfg(debug_assertions)]
            purge_player_cache,
            #[cfg(debug_assertions)]
            clear_player_cache,
            #[cfg(debug_assertions)]
            prune_player_cache,
            #[cfg(debug_assertions)]
            delete_player_cache_file,
            #[cfg(debug_assertions)]
            resolve_player_cache_file,
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[cfg(debug_assertions)]
    app.run(|_app, event| {
        if let tauri::RunEvent::Exit = event {
            let _ = clear_player_cache();
        }
    });

    #[cfg(not(debug_assertions))]
    app.run(|_app, _event| {});
}
