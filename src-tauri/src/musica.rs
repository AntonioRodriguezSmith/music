//! Interactive music normalization pipeline.
//!
//! Spawns the Windows PowerShell scripts under `scripts/musica` (normalize →
//! repair tags → unify → organize) and streams their stdout back to the
//! frontend over `musica://line` / `musica://exit` events.
//!
//! Desktop-only: PowerShell and the `.ps1` scripts do not exist on Android, so
//! the whole module is compiled out there (the `mod musica;` declaration in
//! `lib.rs` is gated on `not(target_os = "android")`).

use serde::Serialize;
use tauri::Emitter;

use crate::state::app_state;

/// Status of the music normalization tooling, reported by `musica_available`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MusicaStatus {
    pub available: bool,
    pub scripts_dir: String,
    pub error: Option<String>,
}

/// Resolve the `scripts/musica` directory (env → dev layout → next to the exe).
fn scripts_dir() -> Result<std::path::PathBuf, String> {
    if let Ok(dir) = std::env::var("CLIP_HARBOUR_SCRIPTS_DIR") {
        let path = std::path::PathBuf::from(dir);
        if path.is_dir() {
            return Ok(path);
        }
    }
    // Dev layout: <repo>/scripts/musica relative to the crate manifest.
    let dev = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("scripts")
        .join("musica");
    if dev.is_dir() {
        return Ok(dev);
    }
    // Packaged layout: <exe>/scripts/musica.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let packaged = parent.join("scripts").join("musica");
            if packaged.is_dir() {
                return Ok(packaged);
            }
        }
    }
    Err("no se encontró la carpeta scripts/musica".to_string())
}

/// Full path to `powershell.exe` on Windows; `None` elsewhere.
#[cfg(target_os = "windows")]
fn powershell_exe() -> Option<std::path::PathBuf> {
    let system32 = std::env::var_os("SystemRoot").map(|root| {
        std::path::PathBuf::from(root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe")
    });
    if let Some(path) = system32 {
        if path.is_file() {
            return Some(path);
        }
    }
    // Fall back to PATH resolution by the OS at spawn time.
    Some(std::path::PathBuf::from("powershell.exe"))
}

#[cfg(not(target_os = "windows"))]
fn powershell_exe() -> Option<std::path::PathBuf> {
    None
}

#[tauri::command(rename_all = "snake_case")]
pub fn musica_available() -> MusicaStatus {
    let scripts = scripts_dir();
    let ps = powershell_exe();
    match (scripts, ps) {
        (Ok(dir), Some(_)) => MusicaStatus {
            available: true,
            scripts_dir: dir.to_string_lossy().into_owned(),
            error: None,
        },
        (Ok(dir), None) => MusicaStatus {
            available: false,
            scripts_dir: dir.to_string_lossy().into_owned(),
            error: Some("powershell.exe no encontrado".to_string()),
        },
        (Err(e), _) => MusicaStatus {
            available: false,
            scripts_dir: String::new(),
            error: Some(e),
        },
    }
}

fn script_name(step: u32) -> Result<&'static str, String> {
    match step {
        0 => Ok("gestion-musica.ps1"),
        1 => Ok("01-normalizar.ps1"),
        2 => Ok("02-reparar-tags.ps1"),
        3 => Ok("03-unificar.ps1"),
        4 => Ok("04-organizar.ps1"),
        other => Err(format!("paso inválido: {other}")),
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn musica_run(
    app: tauri::AppHandle,
    dir: String,
    step: u32,
    apply: bool,
    delete_duplicates: bool,
    remove_junk: bool,
) -> Result<(), String> {
    let scripts = scripts_dir()?;
    let ps = powershell_exe().ok_or("powershell.exe no encontrado")?;
    let runner = scripts.join("_runner.ps1");
    if !runner.is_file() {
        return Err(format!("runner no encontrado: {}", runner.display()));
    }
    let script = script_name(step)?;

    {
        let state = app_state(&app);
        if state.active_musica.lock().unwrap().is_some() {
            return Err("ya hay una normalización en curso".to_string());
        }
    }

    let mut cmd = tokio::process::Command::new(&ps);
    cmd.arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&runner)
        .arg("-Script")
        .arg(script)
        .arg("-Dir")
        .arg(&dir);
    if apply {
        cmd.arg("-Apply");
    }
    if delete_duplicates {
        cmd.arg("-DeleteDuplicates");
    }
    if remove_junk {
        cmd.arg("-RemoveJunk");
    }
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("no se pudo lanzar PowerShell: {e}"))?;

    let pid = child.id().unwrap_or(0);
    {
        let state = app_state(&app);
        *state.active_musica.lock().unwrap() = Some(pid);
    }

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let stdout_app = app.clone();
    let stdout_task = tokio::spawn(async move {
        use tokio::io::AsyncBufReadExt;
        let mut lines = tokio::io::BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = stdout_app.emit("musica://line", line);
        }
    });

    let stderr_app = app.clone();
    let stderr_task = tokio::spawn(async move {
        use tokio::io::AsyncBufReadExt;
        let mut lines = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = stderr_app.emit("musica://line", line);
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("error esperando a PowerShell: {e}"))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    {
        let state = app_state(&app);
        *state.active_musica.lock().unwrap() = None;
    }

    let code = status.code().unwrap_or(-1);
    let _ = app.emit("musica://exit", serde_json::json!({ "code": code }));
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn musica_cancel(app: tauri::AppHandle) -> Result<(), String> {
    let state = app_state(&app);
    let pid = {
        let mut slot = state.active_musica.lock().unwrap();
        slot.take()
    };

    let Some(pid) = pid else {
        return Ok(());
    };
    if pid == 0 {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        // Kill the whole tree: the pipeline may have spawned ffmpeg children.
        tokio::process::Command::new("taskkill")
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .map_err(|e| format!("taskkill falló: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
    }
    Ok(())
}
