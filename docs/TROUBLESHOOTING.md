# Troubleshooting

## Search / downloads only work in the desktop window

Vite in the browser (`localhost:1420`) cannot talk to sidecars. Run:

```powershell
npm run tauri -- dev
```

Use the native Clip Harbour window. On Windows you can also use the **Clip Harbour** desktop shortcut (splash, no console) — see [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md).

## Splash / acceso directo (Windows)

| Symptom | Check |
|---------|--------|
| Se abre una ventana negra de CMD | El `.lnk` debe apuntar a `wscript.exe` + `scripts\launch-clip-harbour.vbs`, no a `powershell.exe` a pelo. Recrea el acceso directo con la guía en [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md). |
| Texto del splash ilegible (`Ã…`, símbolos raros) | `launch-clip-harbour.ps1` debe estar en **UTF-8 con BOM**; textos con `...` ASCII, no `…`. |
| Splash no se cierra nunca | Mira `%TEMP%\clip-harbour-launch.log` y `%TEMP%\clip-harbour-dev.log`. Falta `npm install`, sidecars (`npm run fetch:sidecars:windows`) o error de Rust/MSVC. Prueba `npm run dev:windows` en una terminal para ver el error. |
| **Solo arranca si Cursor está abierto** | El acceso directo estaba usando `tauri dev` (Vite). Al cerrar Cursor muere Vite y queda un `clip_harbour` debug zombie. **Solución:** `npm run tauri -- build` una vez; el lanzador preferirá `%LOCALAPPDATA%\clip_harbour-target\release\clip_harbour.exe` (sin IDE). |
| Doble instancia | Si ya hay `clip_harbour` sano con ventana, el lanzador solo la enfoca. Cierra la app antes de un arranque limpio. |
| Icono genérico en el Escritorio | `IconLocation` → `assets\clip-harbour-app-icon.ico`. |
| En el Administrador de tareas ves `node` de InterLocu / Cursor | No son Clip Harbour. El lanzador solo reconoce el proceso `clip_harbour`. Si el acceso directo no abre nada, mira `%TEMP%\clip-harbour-launch.log` y recrea el `.lnk` (ver [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md)). |
| Splash aparece y la app se cierra al instante | Corregido: el splash ya no redirige stdout del hijo (eso mataba `tauri dev` al cerrar el splash). VBS usa `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` (no el stub WindowsApps). |

## Portable / updates / signing (Fase 3)

| Symptom | Check |
|---------|--------|
| Falta ZIP portable | `npm run tauri -- build` luego `npm run pack:portable:windows` → `%LOCALAPPDATA%\clip_harbour-target\release\bundle\portable\` |
| “Buscar actualizaciones” falla | Comprueba Release [v0.1.0](https://github.com/AntonioRodriguezSmith/music/releases/tag/v0.1.0) / `latest.json`. Sin release firmado el mensaje es claro; la app sigue usable. Ver [PHASE3_SETUP.md](./PHASE3_SETUP.md). |
| Firma Authenticode skip | Sin thumbprint / `CLIP_HARBOUR_PFX_BASE64` (CI) o `PFX_PATH` (local) → `sign-windows` exit 0 a propósito. Normal en uso personal (no hay PFX gratis de confianza). |
| SmartScreen / “editor desconocido” | Esperado sin Authenticode; *Más información* → *Ejecutar de todos modos*, o usa el portable/`clip_harbour.exe` local. |
| `cargo check` / crates.io schannel | Flake de red; limpiar cache corrupt en `.cargo/registry/cache`, `curl -C - --ssl-no-revoke`, o reintentar. Log: `%TEMP%\clip-harbour-cargo-check.log`. CI suele ser más fiable. |
| IDE: *Context access might be invalid* en secrets | Falso positivo del language server con secrets custom. El workflow usa `fromJSON(toJSON(secrets)).…`; ver [PHASE3_SETUP.md](./PHASE3_SETUP.md). |
| Log CI muestra secretos | No debe: List solo imprime `CLIP_HARBOUR_SIGNING_CONFIGURED` (true/false). |
| Updater private key | Solo en `.tauri/` (gitignored) o secrets CI `TAURI_SIGNING_PRIVATE_KEY`. Pubkey en `tauri.conf.json`. |

## Queue emptied when opening a video

Fixed in this fork: one sidebar outside React Router. If you still see it, hard-reload the Tauri window.

## Open folder / open file fails

Tauri blocks `openPath` unless the path matches `opener:allow-open-path` in [`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json). Fase 2 allows Music / Downloads / Documents under the user profile, plus `D:/**` and `E:/**` (covers `Music\MEmu Music`). Restart `tauri -- dev` after capability changes. If your folder is elsewhere, add a pattern there (do not use global `**` without review).

## Search preview vs download metadata

The right preview shows **YouTube video info** from search (views, date, description…).  
**Embed metadata** on the download screen writes title/artist tags into the audio/video file — a different option, chosen only when downloading.

## Search rows-per-page changes when I resize

By design it should **not** after the first layout for that search. Page size is measured once when results appear, then frozen. Resizing may scroll the list if the window is shorter. A **new** search re-measures at the current height.

## Search preview metadata missing

After ~400 ms hover/selection, Fase 2 calls `get_url_details` once per video id (in-memory cache). Until that finishes you may see “Cargando detalles…”. If enrichment fails (403/rate limit), reexport cookies — see [PHASE2_SETUP.md](./PHASE2_SETUP.md). Full format details also load when you open **Abrir / descargar**.

## Search button keeps spinning

Should stop when the first results stream in. If it stays stuck, hard-reload the Tauri window. Starting a new search cancels the previous one.

## Progress stuck ~50–70% then jumps / finishes

Download maps to 0–70% when a convert is needed; conversion continues 70–100%. If it stalls at 70%, ffmpeg may be failing — check the status line for `error:conversion`.

## Stop freezes the queue

Fixed: stop no longer sleeps while holding the download registry lock. If an item stays `cancelled`, wait a few seconds for cleanup or use **Limpiar terminados**.

## 403 Forbidden

YouTube bot checks. Use **Método A**: export `cookies.txt` and choose it in the sidebar ([PHASE2_SETUP.md](./PHASE2_SETUP.md), [cookies/cookies_info.md](./cookies/cookies_info.md)).

Downloads with cookies configured retry automatically up to **2** times (backoff 2s / 5s, status `retrying`). Search / `get_url_details` do not auto-retry in a loop — reexport cookies if bot-check persists.

## Queue resume after restart

Pending items are snapshotted in `localStorage`. On next launch a banner offers **re-download** (not byte-resume). Dismiss clears the snapshot.

## Blank window after release build

If the UI is blank after tightening CSP (`script-src 'self'`), temporarily restore `'unsafe-inline'` on `script-src` in `tauri.conf.json` and report — Vite production assets should not need it.

## Release workflow uploads nothing (GitHub Actions)

`npm run tauri -- build` uses `CARGO_TARGET_DIR`. Locally that defaults to `%LOCALAPPDATA%\clip_harbour-target`. The Actions release workflow **must** set `CARGO_TARGET_DIR` to `src-tauri/target` (see `.github/workflows/release-windows.yml`) so `upload-artifact` finds MSI/NSIS. If you override the env locally, collect artefacts from that same directory.

If the job fails with **MSVC not found**, `scripts/setup-windows-env.ps1` could not locate `vcvars64.bat`. On GitHub Actions it should use `vswhere`; locally install VS “Desktop development with C++” or Build Tools.

## CI Windows lento / cargo check skipped

| Symptom | Check |
|---------|--------|
| Primera ejecución de `check-windows` tras cambio de `Cargo.lock` / toolchain | Normal: cold cache (~500 crates). Siguientes pushes con `src-tauri/**` deben restaurar `Swatinem/rust-cache`. |
| Step `cargo check` aparece **skipped** | No hubo cambios en `src-tauri/**` (filtro `dorny/paths-filter`). Smoke Windows sigue corriendo. |
| Quieres un gate Rust local sin abrir la app | `npm run check:rust` o `npm run check:rust:bg` (log en `%TEMP%\clip-harbour-cargo-check.log`). No uses `npm run tauri` solo para typecheck. |

## Bulk download fails on some videos

Bulk no longer reuses one numeric format id. It uses `bestaudio/best` per URL.

## Leftover `.webm` after M4A

USB BMW / convert path deletes the source after a **successful** conversion. If convert fails, the source is kept on purpose.

## Sidecars missing on Windows

```powershell
npm run fetch:sidecars:windows
npm run smoke:windows
```

## Tauri docs

Use **https://v2.tauri.app/** for Tauri 2 APIs (this app). The root `tauri.app` site may redirect; prefer the v2 URL explicitly.
