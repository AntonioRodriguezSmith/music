# Fase 2 — checklist

Use the **native Tauri window** (`npm run tauri -- dev`, `npm run dev:windows`, or the **Clip Harbour** desktop shortcut / `npm run launch:windows` — see [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md)).

## M0 Setup / cookies

- [x] `.env` desde `.env.example` (no en git)
- [x] Cookies Netscape fuera del repo (`C:\Users\rodri\cookies_youtube\cookies_merged.txt`)
- [x] Sidebar: solo “Elegir cookies.txt”; sin selector de navegador ni `bothWarning`
- [x] Búsqueda corta sin bot-check (yt-dlp `ytsearch1:test` + cookies, 2026-07-25)

## M1 Producto

- [x] Iniciar descarga → cerrar app → al reabrir banner “Reanudar N pendientes”
- [x] Reanudar reencola con la misma config (re-download) — Reintentar OK en UI (2026-07-25)
- [x] Descartar limpia el snapshot (UI presente; dismiss → `clearQueueSnapshot`)
- [x] Historial / open-path: fichero bajo `Music\MEmu Music` abre (shell + ACL `Music/**`; smoke `smoke_phase2.webm`)

## M2 Fiabilidad

- [x] Código: 403 en descarga → status `retrying`, ≤2 retries + backoff si hay cookies (`queue.rs`)
- [x] Código: sin cookies → un solo intento + hint (no retries inútiles)
- [x] Preview: hover ~400 ms → `get_url_details` + cache en memoria (`video_context.jsx`)

## M3 Ingeniería

- [x] `lib.rs` partido en `models` / `state` / `ytdlp` / `queue` (compila vía `tauri -- dev`)
- [x] `npm test` OK (incl. `queue_snapshot`, `cookies_prefs`, `download_history` — 2026-07-25)
- [x] Playwright e2e + workflow CI presentes (`e2e/smoke.spec.js`, `.github/workflows/ci.yml`)
- [x] CI verde en remote Actions (run OK 2026-07-25 tras push a `main`)

## M4 Release / seguridad

- [x] Abrir carpeta / archivo en `...\Music\MEmu Music\...` (ACL `C:/Users/*/Music/**`)
- [x] CSP `script-src 'self'` en `tauri.conf.json` (app arranca en `tauri -- dev`)
- [x] `npm run sign:windows` sin env → skip exit 0

## M5 Docs

- [x] PHASE2.md / SETUP / AUDIT / CHECKLIST / CHANGELOG / README / TROUBLESHOOTING actualizados
- [x] Smoke manual cerrado (cookies + descarga + open file + resume) — ver [PHASE2_AUDIT.md](./PHASE2_AUDIT.md)
