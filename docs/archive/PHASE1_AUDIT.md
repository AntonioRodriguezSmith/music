# Phase 1 audit report

**Product:** Clip Harbour (Windows fork)  
**Date:** 2026-07-21  
**Scope:** Closeout audit (no M2b feature implementation)  
**Verdict: Fase 1 CERRADA**

## Summary

| Area | Result | Notes |
|------|--------|-------|
| A Functional | PASS | USB BMW → M4A verified on device; open folder (Explorer) OK |
| B Security | PASS | Desktop trust model; opener/CSP debt accepted → Phase 2 |
| C Code / architecture | PASS | Providers/listeners OK; `lib.rs` monolith → Phase 2 |
| D Tests | PASS | 12 files / 43 tests; smoke Windows green |
| E i18n | PASS | 128 keys EN ↔ ES, no missing keys |
| F Docs | PASS | Transparent drift fixed; audit docs added |
| G Build / packaging | PASS | `cargo check`, smoke, and **release** MSI + NSIS built |

## Findings

| ID | Sev | Area | Finding | Status |
|----|-----|------|---------|--------|
| F1 | P1 | Docs | `WINDOWS.md` claimed `transparent: false` while conf has `true` | **Fixed** |
| F2 | P1 | Tests | Missing coverage for payload / history / cookies prefs | **Fixed** |
| F3 | P2 | Security | Broad `opener:allow-open-path` (`**`) | Phase 2 |
| F4 | P2 | Security | CSP `'unsafe-inline'` + `img-src https:` | Phase 2 |
| F5 | P2 | Arch | Monolithic `lib.rs` | Phase 2 |
| F6 | P2 | CI | No GitHub Actions | Phase 2 |
| F7 | P3 | Packaging | Code signing not applied | Phase 2 (unsigned MSI/NSIS produced) |

**No P0 findings. No open Phase 1 exceptions.**

## Evidence

### Automated

- `npm test`: **12 passed / 43 tests** (2026-07-21)
- `npm run smoke:windows`: **passed** (yt-dlp 2026.07.04, ffmpeg N-125551, vitest OK)
- `cargo check` (`src-tauri`): **Finished** OK
- `npm run tauri -- build`: **exit 0** — release app + 2 bundles:
  - `clip_harbour_0.1.0_x64_en-US.msi`
  - `clip_harbour_0.1.0_x64-setup.exe`  
  (under the session `CARGO_TARGET_DIR` …`/release/bundle/`)

### Functional closeout (2026-07-21)

- **USB BMW / convert:** download folder `C:\Users\rodri\Music\MEmu Music` contains many `.m4a` (e.g. DaBaby … 2026-07-21); Tauri logs show `ffmpeg conversion completed: ….m4a`. Leftover `.webm` only when convert fails (by design).
- **Open folder:** `explorer.exe` launched successfully on the download directory; app capability `opener:allow-open-path` in place.

### Security inventory

- Capabilities: `windows: ["main"]`; window chrome; dialog; shell limited to yt-dlp & ffmpeg sidecars; opener open-url + open-path (`**`).
- `withGlobalTauri: false`.
- CSP: `default-src 'self'`; images `https:`; `unsafe-inline` for styles/scripts.
- Secrets: `.env` / `cookies.txt` / Windows sidecars gitignored.

### i18n

- Structural key diff EN vs ES: **0 missing** (128 / 128).

## Phase 2 backlog

- Session queue persistence across app restarts
- Open finished file from history
- Automatic 403 retry with backoff
- Enrich preview via `get_url_details` on hover
- GitHub Actions CI; E2E Playwright
- Split monolithic `src-tauri/src/lib.rs`
- Code-signed Windows installer
- Tighten `opener:allow-open-path` to download directory only (if UX allows)
- Stricter CSP (reduce `unsafe-inline` where possible)

## Local quality gate

```powershell
npm test
npm run smoke:windows
npm run tauri -- build   # release MSI + NSIS
npm run tauri -- dev     # interactive
```

## Sign-off

**Fase 1: CERRADA** (2026-07-21)
