//! Filesystem / platform helpers exposed as commands.
//!
//! Desktop: open paths in the OS and pick folders with the native dialog.
//! Mobile (Android): there is no file manager to open paths in and folder
//! picking does not apply (music lives in `document_dir`), so `open_path`
//! returns a clear error and `pick_download_dir` returns the app-managed
//! default instead of opening a dialog.

use serde::Serialize;

/// Open a path with the OS (Explorer/Finder) — desktop only.
#[tauri::command]
pub fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_path(&path, None::<&str>)
            .map_err(|e| format!("open path failed: {e}"))
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, path);
        Err("openPath no está disponible en móvil".into())
    }
}

/// Pick a download folder. Desktop: native directory dialog. Android: no
/// folder picking — the app-managed `document_dir/Music` is the destination.
#[tauri::command(rename_all = "snake_case")]
pub fn pick_download_dir(app: tauri::AppHandle, title: String) -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_dialog::DialogExt;
        let picked = app
            .dialog()
            .file()
            .set_title(&title)
            .blocking_pick_folder();
        Ok(picked.map(|p| p.to_string()))
    }
    #[cfg(not(desktop))]
    {
        let _ = title;
        Ok(crate::ytdlp::default_download_dir(&app))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileDirs {
    pub download_dir: String,
    pub keep_dir: String,
    pub cookies_dir: String,
}

/// App-managed library directories, resolved via `app.path()`. The mobile UI
/// shows these instead of desktop folder pickers / open-path buttons.
#[tauri::command(rename_all = "snake_case")]
pub fn mobile_default_dirs(app: tauri::AppHandle) -> Result<MobileDirs, String> {
    use tauri::Manager;
    let download_dir = crate::ytdlp::default_download_dir(&app).unwrap_or_default();
    let keep_dir = crate::player_cache::resolve_player_root(&app)
        .to_string_lossy()
        .into_owned();
    let cookies_dir = app
        .path()
        .app_data_dir()
        .map(|d| d.join("cookies").to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(MobileDirs {
        download_dir,
        keep_dir,
        cookies_dir,
    })
}
