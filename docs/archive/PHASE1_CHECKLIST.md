# Phase 1 — executable checklist

Use the **native Tauri window** (`npm run tauri -- dev` or `npm run dev:windows`).

## Commands (automated)

- [x] `npm test` — 12 files / 43 tests green (2026-07-21)
- [x] `npm run smoke:windows` — sidecars OK + vitest (2026-07-21)
- [x] `cargo check` in `src-tauri` — Finished OK (2026-07-21)
- [x] `npm run tauri -- build` — MSI + NSIS produced (2026-07-21)

## A — Functional (manual)

### Search

- [x] Text search: spinner stops when first results appear
- [x] Second search while first loads cancels prior yt-dlp
- [x] Resize: rows-per-page frozen; list may scroll
- [x] Pagination bar pinned at bottom
- [x] Columns Título / Canal / Duración align
- [x] Paste YouTube URL → `/val`
- [x] Drag-drop URL onto search
- [x] Search history dropdown

### Preview & bulk

- [x] Hover preview listing metadata
- [x] Streaming does not reset preview to first hit
- [x] Bulk requires download folder
- [x] Bulk `bestaudio/best` per URL

### Download modes & queue

- [x] Modes Standard / USB BMW / PC
- [x] **USB BMW → M4A** verified on device (`MEmu Music`, ffmpeg conversion logs)
- [x] Max 2 parallel + `queued`
- [x] Progress 0–70 / 70–100
- [x] Stop without freezing queue
- [x] Queue survives `/` ↔ `/val`

### History, cookies, chrome

- [x] Historial + export `.txt`
- [x] **Open folder** verified (Explorer on download dir)
- [x] Cookie prefs persist
- [x] ES | EN
- [x] Titlebar drag/min/max/close
- [x] Windows: pause hidden

## B — Security (static)

- [x] Capabilities scoped to `windows: ["main"]`
- [x] `withGlobalTauri: false`
- [x] Shell ACL only yt-dlp / ffmpeg sidecars
- [x] No real cookies / `.env` secrets committed
- [x] `opener:allow-open-path` risk documented → Phase 2
- [x] CSP documented → Phase 2
- [x] `transparent` docs match conf (`true`)

## C — Code

- [x] No `TODO`/`FIXME` / `console.log` in `src/`
- [x] Search cancel + `search_id`
- [x] Download queue provider outside Routes
- [x] Monolith `lib.rs` → Phase 2 debt

## D — Tests & docs

- [x] Critical libs covered
- [x] Docs aligned
- [x] Phase 2 backlog explicit in audit report

## Sign-off

| Role | Date | Result |
|------|------|--------|
| Auditor | 2026-07-21 | **PASS — Fase 1 CERRADA** |
| Notes | | Release bundles unsigned (signing → Phase 2) |
