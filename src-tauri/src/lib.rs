mod models;
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
use ytdlp::{get_top_search, get_url_details, get_ytdlp_version};

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
    tauri::Builder::default()
        .setup(|app| {
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
            get_url_details,
            resume_download,
            clear_finished_downloads,
            get_ytdlp_version,
            player_cache_dir,
            player_keep_dir,
            playlist_dir,
            resolve_playlist_file,
            list_playlist_video_ids,
            clear_playlist_media,
            append_playlist_archive,
            promote_to_playlist,
            delete_playlist_file,
            delete_playlist_dir,
            rename_playlist_dir,
            purge_player_cache,
            clear_player_cache,
            prune_player_cache,
            delete_player_cache_file,
            resolve_player_cache_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                let _ = clear_player_cache();
            }
        });
}
