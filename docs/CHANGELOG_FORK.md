# Clip Harbour fork — changelog

Windows-oriented fork of Clip Harbour (Tauri 2 + React + yt-dlp/ffmpeg).

## 2026-07 — P10 Player rate-limit + listas UX

- **P10a:** `CLIP_HARBOUR_YT_SLEEP=soft\|strict`, gap cola 4/8 s, banner rate-limit, prefetch opt-in.
- **P10b:** reconcile disco, `.archive.txt`, estados offline/guardando/pendiente.
- **P10c:** crear lista inline, menú ⋯ rename/vaciar/borrar, badge preparación.
- **P10d:** import YouTube `list=` — parking (no implementado).
- **Docs:** [PLAYER_PLAYLISTS.md](./PLAYER_PLAYLISTS.md).

## 2026-07 — Player playlists offline + docs

- **Playlists:** multi-lista (`names` + slug), carpeta `playlists/<slug>/`, offline al Añadir, `promote_to_playlist`, play sin auto-add.
- **Rate-limit:** 1 job paralelo, sleeps yt-dlp, gap cola, mensaje de error amigable.
- **Docs:** [PLAYER_PLAYLISTS.md](./PLAYER_PLAYLISTS.md).

## 2026-07 — Phase 4 Player MVP (P0–P9)

- **Mode:** titlebar toggle Descarga|Player; route `/player` — search, playlist, cache play ≤720p, Descargar audio.
- **Docs:** [PHASE4.md](./PHASE4.md) · [phase4/SPEC.md](./phase4/SPEC.md) · [PHASE4_AUDIT.md](./PHASE4_AUDIT.md).
- **Backend:** `purpose=cache`, `player_cache_dir` / `purge_player_cache`, CSP `media-src` asset.
- **PRs:** individual `phase4(P#)` still pending (implemented in one pass).

## 2026-07 — Phase 4 docs scaffold (P0)

- **Hub:** [PHASE4.md](./PHASE4.md) (mapa + cierres only) · [phase4/SPEC.md](./phase4/SPEC.md) · [PHASE4_SETUP.md](./PHASE4_SETUP.md) · [PHASE4_CHECKLIST.md](./PHASE4_CHECKLIST.md).
- **Subplans:** [phase4/](./phase4/) P0–P9.

## 2026-07 — Phase 3 release ops

- **GitHub Release:** [v0.1.0](https://github.com/AntonioRodriguezSmith/music/releases/tag/v0.1.0) — MSI, NSIS, portable ZIP, exe, updater `.sig` + `latest.json`.
- **Portable README:** [PORTABLE_README.txt](./PORTABLE_README.txt) copied into the ZIP as `README.txt` (`pack-portable-windows.ps1`).
- **Secrets:** `TAURI_SIGNING_PRIVATE_KEY` set; no Authenticode PFX (skip by design for personal use).
- **Local:** `npm run check:rust` OK after crates.io/schannel cache repair.
- **Deferred:** paid code-signing cert; app rename (`productName` / exe / `identifier`). Docs: [PHASE3_SETUP.md](./PHASE3_SETUP.md).

## 2026-07 — Phase 3

- **Summary:** [PHASE3.md](./PHASE3.md) · setup [PHASE3_SETUP.md](./PHASE3_SETUP.md) · checklist [PHASE3_CHECKLIST.md](./PHASE3_CHECKLIST.md) · audit [PHASE3_AUDIT.md](./PHASE3_AUDIT.md).
- **Distribution:** portable ZIP (`pack:portable:windows`), desktop shortcut installer, CH icons regenerated into `src-tauri/icons`.
- **Signing:** `sign-windows.ps1` covers release tree; CI uses `CLIP_HARBOUR_PFX_BASE64` → temp PFX (no local path secret); logs only `CLIP_HARBOUR_SIGNING_CONFIGURED`.
- **Updater:** `tauri-plugin-updater` + process relaunch; endpoint GitHub Releases `latest.json`.
- **UX:** cancel all queue; history remove / open folder / pager; empty search history + clear results; preview cache cleared on cookies change.

## 2026-07 — Phase 2 closeout (standalone launcher)

- **Launcher:** desktop splash prefers `%LOCALAPPDATA%\clip_harbour-target\release\clip_harbour.exe` (no Cursor/Vite); stale debug without Vite is restarted — [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md).
- **Docs:** `docs/WINDOWS.md` (moved from `cookies/`); Phase 1–2 audits/checklists under [archive/](./archive/); cookies prefs file-only cleanup.

## 2026-07 — Audit cleanup (launcher / FE / Rust)

- **Launcher:** splash starts `dev-windows.ps1` via detached System32 PowerShell; fail-fast if entry script missing, child exits ≠0, or no `clip_harbour` window ~45s after clean exit — [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md).
- **Bulk vs single:** opening one search result clears multi-select so download is not forced into bulk (`shouldTreatAsBulk`).
- **Checkbox:** controlled `checked` on the hidden input.
- **Resume:** failed retries keep remaining snapshot rows and show `sidebar.resumeFailed`; successes are dropped from the banner.
- **Rust:** process registry recovers poisoned locks (stop can kill); download paths use `Path::join`; missing cookies file errors early; ffmpeg conversion errors include truncated stderr.
- **Cleanup:** orphan i18n keys + deprecated search page-size helpers removed.

## 2026-07 — Cargo check optimize (CI + local)

- **CI:** `Swatinem/rust-cache@v2` on `check-windows` + `dorny/paths-filter` so `cargo check` runs only when `src-tauri/**` changes; Windows smoke always runs.
- **Release:** same rust-cache on `release-windows.yml` (still `workflow_dispatch`).
- **Local:** `npm run check:rust` / `check:rust:bg` ([`scripts/cargo-check-windows.ps1`](../scripts/cargo-check-windows.ps1), log `%TEMP%\clip-harbour-cargo-check.log`).
- **Deps:** `tokio` features trimmed from `full` to `rt`, `macros`, `time`, `sync`.

## 2026-07 — Phase 2

- **Summary:** [PHASE2.md](./PHASE2.md) · setup [PHASE2_SETUP.md](./PHASE2_SETUP.md) · audit [archive/PHASE2_AUDIT.md](./archive/PHASE2_AUDIT.md) · checklist [archive/PHASE2_CHECKLIST.md](./archive/PHASE2_CHECKLIST.md).
- **Status:** closed 2026-07-25 — smoke manual OK (cookies Method A, download, open file, resume banner → Reintentar).
- **Cookies:** sidebar file-only (Método A); `cookieInvokeArgs` never sends browser flag when a file is set.
- **Queue:** `start_download` returns `process_id`; FE snapshot + resume banner (re-download).
- **History:** open finished file via `openPath`.
- **Downloads:** 403/bot-check retry ≤2 with backoff when cookies present; status `retrying`.
- **Preview:** debounce 400 ms + in-memory `get_url_details` cache.
- **Rust:** `lib.rs` split into `models` / `state` / `ytdlp` / `queue`.
- **CI:** `.github/workflows/ci.yml` + Playwright Vite smoke; `release-windows.yml` pins `CARGO_TARGET_DIR` to `src-tauri/target` on Actions so MSI/NSIS upload works (local builds still use `%LOCALAPPDATA%\clip_harbour-target`).
- **Security:** opener ACL (Music/Downloads/Documents + D:/E:); CSP `script-src 'self'`; optional `scripts/sign-windows.ps1` (skip exit 0 without cert).
- **Launch (dev):** `npm run tauri -- dev` / `npm run dev:windows`, or desktop shortcut **Clip Harbour** with splash (no console) — [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md); assets in `assets/clip-harbour-app-icon.*`.
- **Not in Phase 2:** portable ZIP package; unified Tauri window icons with splash CH mark (optional follow-up).

## 2026-07 — Phase 1 closeout

- **Summary:** [PHASE1.md](./PHASE1.md) — what shipped, how to build installers, Phase 2 backlog.
- **Audit:** [archive/PHASE1_AUDIT.md](./archive/PHASE1_AUDIT.md) — verdict **Fase 1 CERRADA**.
- **Checklist:** [archive/PHASE1_CHECKLIST.md](./archive/PHASE1_CHECKLIST.md).
- Closeout evidence: USB BMW → M4A on device; open folder OK; `npm run tauri -- build` produced MSI + NSIS.
- Added Vitest coverage for `build_download_payload`, `download_history`, `cookies_prefs`.
- Docs: `transparent: true` aligned with `tauri.conf.json` (rounded shell).
- Deferred items remain Phase 2 (see audit report).

## 2026-07 — Search layout / search bar / re-search

### Page size (frozen after measure)
- Measure list height once when results appear (`pageSizeForListHeight`); **lock** `pageSize` so resizing the window does not change rows-per-page or “Página X / N”.
- Pagination bar fixed height (`SEARCH_PAGINATION_HEIGHT_PX`) pinned to the bottom; list area `overflow-y-auto` if the window shrinks.
- New search unlocks and re-measures at the current window size.
- Helpers: [`src/lib/search_constants.js`](../src/lib/search_constants.js) (`shouldRecalcPageSize`).

### Search bar chrome
- Rounded input group (`rounded-xl`), **black** border; **black** button with **white** magnifying-glass icon ([`src/components/svg/search.jsx`](../src/components/svg/search.jsx)).
- Busy spinner clears when the first real results stream in (does not wait for the full `ytsearch50` batch).

### Re-search / cancel
- New query allowed while a search is in flight; previous yt-dlp search child is killed; stale `search_id` updates ignored.
- In-flight errors do not wipe a newer search’s results.

### Columns
- Shared `SEARCH_RESULT_GRID` for header + rows (Title / Channel left, Duration right).

## 2026-07 — Search preview / window chrome

### Search results UI
- Hover row: black background + white text; clickable overlay keeps checkbox usable.
- **Preview panel** (right): YouTube **listing** info from the search dump (title, channel, duration, views, likes, date, id, description when present). This is **not** the same as download “Embed metadata” (ID3/tags written into the file). No extra yt-dlp call on hover.
- Helpers: [`src/lib/preview_meta.js`](../src/lib/preview_meta.js), [`src/lib/search_constants.js`](../src/lib/search_constants.js).

### Window chrome (iTunes-inspired)
- Soft rounded shell (12px), light `#f5f5f7` surface, gradient titlebar, centered title.
- Circular traffic-light controls (min / max / close) on the **right**; glyphs on hover.
- Maximized: no radius / shadow.

## 2026-07 — Queue / progress / stability

### Stabilized (M0)
- Single sidebar + `DownloadQueueProvider` so the queue survives `/` ↔ `/val` navigation.
- yt-dlp progress merged into existing entries (filename/title preserved); yt-dlp `status` ignored.
- Conversion only after successful download (`downloaded`); ffmpeg child registered and killable via Stop.
- Stop no longer holds the download registry lock across the cleanup sleep.
- Search: `search_id` + NDJSON stdout buffer; opening a result always loads `get_url_details`.
- Bulk uses `-f bestaudio/best` per URL; download folder required before start.
- CH brand uses React Router `Link`.

### Progress & UI (M1)
- Unified progress: download 0–70%, convert 70–100% (or 0–100% when no convert); clamp; 100% on finished.
- Sidebar tabs **Cola | Historial**, pagination Previous/Next (no View all), clear finished, open folder.

### App QoS (M2)
- Download history (localStorage) + export `.txt`.
- Parallel downloads capped at **2** with `queued` status.
- USB BMW defaults: metadata on, thumbnail off.
- Toast when a batch finishes; yt-dlp version in sidebar; drag-drop URL onto search.
- Manual 403 hint (cookies).

### Security / docs (M3–M4)
- CSP set; capabilities `windows: ["main"]`; `withGlobalTauri: false`.
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) and [WINDOWS.md](./WINDOWS.md).

### Deferred → Phase 2 (delivered — see Phase 2 section above)
- Session queue persistence across app restarts.
- Open finished file from history.
- Automatic 403 retry with backoff.
- Enrich preview via `get_url_details` on stable hover (debounce + cache).
- CI, E2E, split `lib.rs`, tighten opener ACL / CSP, optional Windows signing.
