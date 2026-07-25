# Windows changes (fork notes)

This fork adds **Windows support** for [Clip Harbour](https://github.com/amansxcalibur/clip_harbour) (Tauri 2 + yt-dlp). Upstream releases are **Linux-only** as of v0.1.0-alpha; there is no official Windows installer yet.

Docs for this stack: [Tauri 2](https://v2.tauri.app/) (not [Tauri 1](https://v1.tauri.app/)).

## Quick start (Windows)

1. Install **Node.js**, **Rust** (`rustup`), **WebView2**, and **MSVC** (“Desktop development with C++” or Build Tools) + **Windows 10/11 SDK**.
2. `npm install`
3. `npm run fetch:sidecars:windows` — downloads `yt-dlp` and `ffmpeg` into `src-tauri/binaries/` with the Tauri triple names.
4. Optional: copy `.env.example` → `.env` and set `VITE_DEFAULT_DOWNLOAD_PATH`.
5. `npm run test` then `npm run smoke:windows`
6. `npm run dev:windows` (or `.\dev-windows.ps1`)
7. **Optional polished launch:** desktop shortcut **Clip Harbour** → splash (large icon + progress, no console). Docs: [LAUNCHER_WINDOWS.md](../LAUNCHER_WINDOWS.md). Assets: `assets/clip-harbour-app-icon.{png,ico}`; scripts: `scripts/launch-clip-harbour.{vbs,ps1}`.

Use the **native Clip Harbour window**. The Vite URL on port `1420` is only the web frontend; `invoke` / sidecars will not work in a normal browser.

## Phase 1 status

**Closed** (2026-07-21). Summary: [PHASE1.md](../PHASE1.md). Audit: [PHASE1_AUDIT.md](../PHASE1_AUDIT.md).

## Release build (Windows installers)

```powershell
npm run fetch:sidecars:windows   # if not already present
npm run tauri -- build
```

Uses `scripts/tauri-windows.ps1` (MSVC + `CARGO_TARGET_DIR`, default `%LOCALAPPDATA%\clip_harbour-target`).

Outputs (relative to `CARGO_TARGET_DIR`):

- `release\clip_harbour.exe`
- `release\bundle\msi\clip_harbour_0.1.0_x64_en-US.msi`
- `release\bundle\nsis\clip_harbour_0.1.0_x64-setup.exe`

Installers are **unsigned** (code signing is Phase 2). Upstream GitHub releases remain Linux-oriented; this fork builds Windows packages locally.

## What changed

### Backend (`src-tauri`)

| Change | Why |
|--------|-----|
| `nix` only under `cfg(unix)` | Pause/resume uses Unix signals; Windows builds without `nix`. |
| `pause_download` / resume no-op on Windows | Avoid panics; pause/resume buttons hidden on Windows UI. |
| Sidecar names `yt-dlp` / `ffmpeg` | Match upstream + `externalBin: ["binaries/yt-dlp", ...]`. |
| Stronger error returns (`Result<_, String>`) on search / URL / download | Frontend can show failures instead of hanging on “Fetching…”. |
| Download pipeline: `--ffmpeg-location`, format fallbacks, stderr handling | More reliable merges on Windows. |
| Serde defaults / checkbox false filtering | Avoid IPC failures from empty paths or unchecked options. |
| Window `label: "main"` + `withGlobalTauri` | Capabilities bind to the main window; easier debugging. |
| Capabilities: shell spawn/execute for sidecars + `core:event` | Allow yt-dlp/ffmpeg sidecars under Tauri 2 ACL. |
| `ytsearch50` (+ load more → 100) | Larger search batch; UI paginates with a **frozen** page size (8–30) measured once per search. |
| Active search cancel (`active_search` / `active_search_id`) | New query kills the previous yt-dlp search process. |
| Download status codes normalized (`starting`, `converting`, `finished`, …) | Stable keys for i18n. |
| Window `decorations: false`, `shadow`, `minWidth`/`minHeight` | Frameless floating look; custom title bar. |
| Capabilities: window drag / minimize / maximize / close | Required for custom title bar controls. |

### Frontend

| Change | Why |
|--------|-----|
| Smarter URL vs search detection | Accepts `youtu.be`, bare ids, URLs without `http://`. |
| Search errors surfaced in UI | Catch `invoke` failures instead of infinite loading. |
| Download path: `.env` + `localStorage` | Portable default; remembers last folder. |
| Sidebar edge toggle | Explicit open/close instead of hover-only. |
| Download config / status UI fixes | Clearer finished vs active states; config errors. |
| `react-i18next` (ES default / EN) + locale prefs | Full UI translation; language toggle in sidebar. |
| Search pagination (measure once, then freeze) + fixed bottom bar | Rows/page stable on resize; list scrolls if window shrinks; Prev/Next for pages. |
| Search bar (rounded, black border / black button / white icon) | Matches app chrome; spinner stops on first streamed results. |
| Search hover preview (16:9) + listing metadata | Thumbnail + views/likes/date/id/description from search dump; no reset to first result on streaming `search-update`. |
| Format list UX (`options.jsx`, `format_details.js`) | Audio-only first (bitrate/size sort); column headers; scroll per page + Anterior/Siguiente (**12**/page). |
| Key data panel (`file_desc.jsx`) | Curated fields with i18n labels (codec, bitrate, sample rate, resolution, size); codecs mapped to AAC/H.264/VP9 etc. |
| Bulk select + `bestaudio/best` per URL | Multi-download from results without reusing one numeric format id. |
| Custom title bar component | Replace OS chrome after `decorations: false`. |

### Tooling / docs

| File | Role |
|------|------|
| `scripts/setup-windows-env.ps1` | Puts `cargo` on PATH, loads MSVC/SDK, sets `CARGO_TARGET_DIR`. |
| `scripts/tauri-windows.ps1` | Wraps `tauri` CLI so `npm run tauri -- dev` works from IDE terminals. |
| `dev-windows.ps1` | Loads MSVC, prefers system SDK `INCLUDE`, sets `CARGO_TARGET_DIR` under `%LOCALAPPDATA%` (avoids Proton Drive / synced folders). |
| `.vscode/settings.json` | Prepends `.cargo\bin` to integrated terminal PATH. |
| `scripts/fetch-windows-sidecars.ps1` | Fetches Windows `yt-dlp.exe` + `ffmpeg.exe` with correct sidecar filenames. |
| `scripts/smoke-windows.ps1` | Smoke: sidecar presence/`--version` + `vitest`. |
| `scripts/launch-clip-harbour.vbs` / `.ps1` | Silent splash launcher (no console); see [LAUNCHER_WINDOWS.md](../LAUNCHER_WINDOWS.md). |
| `assets/clip-harbour-app-icon.png` / `.ico` | Splash + desktop shortcut icon. |
| `src/lib/format_details.js` | Shared format labels, key-data rows, audio/video codec display helpers. |
| `src/lib/*.test.js` | Unit tests for URL resolve, download path, status helpers. |
| `.env.example` | Optional `VITE_DEFAULT_DOWNLOAD_PATH`. |
| `docs/cookies/cookies_info.md` | Guía de cookies YouTube para yt-dlp / sidebar. |
| `docs/cookies/cookies.txt.example` | Plantilla Netscape (sin cookies reales); ver `cookies_info.md`. |
| `.gitignore` | Ignores Windows binaries, Linux/macOS sidecars, `.env`, `cookies.txt`, local `.cargo/config.toml`. |

## Removed (obsolete)

- `ffmpeg_build.sh` — Linux custom ffmpeg build; Windows uses Gyan essentials via fetch script.
- Non-Windows sidecars under `src-tauri/binaries/` (linux/darwin) — not needed for this fork.
- Unused mock JSON in `src/data/`.
- Debug `console.log` noise and dead Vite alias comments.

## Known limitations

- **Pause / resume** downloads: not supported on Windows (Unix signals only).
- **Upstream GitHub releases**: still Linux-oriented. This fork can produce local Windows MSI/NSIS via `npm run tauri -- build` (unsigned).
- Do not commit large `*-pc-windows-msvc.exe` sidecars; fetch them with the script.
- Search shows up to **50** hits (`ytsearch50`), optional load more to **100**; **rows per page** are measured once when results appear (8–30) and stay fixed until the next search. Format list uses **12** per page. Queue sidebar uses **6** per page. Dev launch: `npm run tauri -- dev` (no desktop icon until you build/install).
- Window uses `transparent: true` with frameless chrome + CSS radius/shadow (for rounded shell); not a see-through UI.
- Custom title bar relies on window capabilities; without them, drag/min/max/close will fail.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `failed to get cargo metadata: program not found` | Terminal sin `%USERPROFILE%\.cargo\bin`. Usa `npm run tauri -- dev` (wrapper) o `npm run dev:windows`. Abre una **nueva** terminal tras el cambio de `.vscode/settings.json`. |
| YouTube “Sign in to confirm you’re not a bot” | Open sidebar → **YouTube cookies**: pick `cookies.txt` (best) or try **firefox**. Chrome/Edge often fail on Windows. Full guide: [cookies_info.md](./cookies_info.md) and [yt-dlp wiki](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies). Also update yt-dlp: `npm run fetch:sidecars:windows`. |
| Stuck on Fetching… / invoke “does nothing” | Are you in the **desktop** window, not the browser? Open DevTools (Ctrl+Shift+I) there. |
| Sidecar / yt-dlp errors | Re-run `npm run fetch:sidecars:windows`; confirm files exist under `src-tauri/binaries/`. |
| MSVC / `winapifamily.h` missing | Install full Windows SDK; `setup-windows-env.ps1` prepends system SDK includes. |
| Port 1420 in use | Kill leftover `node` / Vite processes, then restart the launcher. |
| Slow or locked builds on Proton Drive | `CARGO_TARGET_DIR` is set to `%LOCALAPPDATA%\clip_harbour-target`. |
| Cannot drag / minimize / close window | Frameless mode needs `core:window:allow-start-dragging` (and min/max/close) in `capabilities/default.json`. |
| UI clipped / format list hard to use | Format panel scrolls inside each page; use Anterior/Siguiente for pages beyond 12 formats. Search rows/page stay fixed after first measure (list scrolls if the window is shorter). Window ≥ `minWidth`/`minHeight` (1024×640). |
| Preview always shows first search hit | Fixed: preview index no longer resets on every `search-update` while streaming; only on new search or page change. |
| Search button spinner never stops | Fixed: busy clears when the first real results arrive (not after the full batch). |
| Cannot start a second search while the first is loading | Fixed: new search cancels the previous yt-dlp process and invalidates stale `search_id` updates. |
