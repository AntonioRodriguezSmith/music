use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, AtomicUsize};
use std::sync::Arc;
use tauri::async_runtime::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;

use crate::models::{Download, DownloadConfig};

pub static PROCESS_COUNTER: AtomicUsize = AtomicUsize::new(0);
pub const MAX_PARALLEL_DOWNLOADS: usize = 2;

#[derive(Debug, Clone)]
pub struct AppState {
    pub process_registry: Arc<std::sync::Mutex<HashMap<usize, CommandChild>>>,
    pub download_registry: Arc<Mutex<HashMap<usize, Download>>>,
    pub pending_downloads: Arc<Mutex<VecDeque<(usize, DownloadConfig)>>>,
    /// Active yt-dlp search process (killed when a newer search starts).
    pub active_search: Arc<std::sync::Mutex<Option<CommandChild>>>,
    pub active_search_id: Arc<AtomicU64>,
}

pub fn app_state(app: &tauri::AppHandle) -> AppState {
    app.state::<AppState>().inner().clone()
}
