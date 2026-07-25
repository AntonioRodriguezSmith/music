# Clip Harbour fork — changelog

Windows-oriented fork of Clip Harbour (Tauri 2 + React + yt-dlp/ffmpeg).

## 2026-07 — Phase 2

- **Summary:** [PHASE2.md](./PHASE2.md) · setup [PHASE2_SETUP.md](./PHASE2_SETUP.md) · audit [PHASE2_AUDIT.md](./PHASE2_AUDIT.md) · checklist [PHASE2_CHECKLIST.md](./PHASE2_CHECKLIST.md).
- **Status:** closed 2026-07-25 — smoke manual OK (cookies Method A, download, open file, resume banner → Reintentar).
- **Cookies:** sidebar file-only (Método A); `cookieInvokeArgs` never sends browser flag when a file is set.
- **Queue:** `start_download` returns `process_id`; FE snapshot + resume banner (re-download).
- **History:** open finished file via `openPath`.
- **Downloads:** 403/bot-check retry ≤2 with backoff when cookies present; status `retrying`.
- **Preview:** debounce 400 ms + in-memory `get_url_details` cache.
- **Rust:** `lib.rs` split into `models` / `state` / `ytdlp` / `queue`.
- **CI:** `.github/workflows/ci.yml` + Playwright Vite smoke; `release-windows.yml` for unsigned artifacts.
- **Security:** opener ACL (Music/Downloads/Documents + D:/E:); CSP `script-src 'self'`; optional `scripts/sign-windows.ps1` (skip exit 0 without cert).
- **Launch (dev):** no desktop icon — `npm run tauri -- dev` / `npm run dev:windows` (native window only).

## 2026-07 — Phase 1 closeout

- **Summary:** [PHASE1.md](./PHASE1.md) — what shipped, how to build installers, Phase 2 backlog.
- **Audit:** [PHASE1_AUDIT.md](./PHASE1_AUDIT.md) — verdict **Fase 1 CERRADA**.
- **Checklist:** [PHASE1_CHECKLIST.md](./PHASE1_CHECKLIST.md).
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
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) and [cookies/WINDOWS.md](./cookies/WINDOWS.md).

### Deferred → Phase 2 (delivered — see Phase 2 section above)
- Session queue persistence across app restarts.
- Open finished file from history.
- Automatic 403 retry with backoff.
- Enrich preview via `get_url_details` on stable hover (debounce + cache).
- CI, E2E, split `lib.rs`, tighten opener ACL / CSP, optional Windows signing.
