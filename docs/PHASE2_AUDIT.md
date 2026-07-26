# Fase 2 — auditoría

**Veredicto: Fase 2 IMPLEMENTADA** (smoke manual 2026-07-25 completo: cookies + búsqueda + descarga + open-file + reanudar cola).

## Alcance revisado

| Área | Estado |
|------|--------|
| Cookies UI file-only + Método A docs | Hecho |
| `start_download` → `process_id`; snapshot + banner | Hecho |
| Abrir fichero historial | Hecho |
| Retry 403 descarga (cookies required for retries) | Hecho (código; smoke manual de 403 no forzado) |
| Preview enrich debounce + cache | Hecho (código; smoke hover parcial) |
| Split `lib.rs` → models/state/ytdlp/queue | Hecho (`cargo check` OK) |
| CI + Playwright Vite smoke | Hecho — CI verde en `main` (2026-07-25) |
| Opener ACL + CSP + sign script | Hecho |
| Release Actions artifact path | Corregido: `CARGO_TARGET_DIR=src-tauri/target` en `release-windows.yml` |

## Riesgos residuales

1. **Opener ACL:** carpetas fuera de Music/Downloads/Documents y no en D:/E: fallarán al abrir; ampliar `capabilities/default.json` si hace falta — no volver a `**` global sin revisión.
2. **CSP:** `script-src 'self'` puede romper algún edge case de carga; si la app en blanco tras `tauri build`, documentar y reañadir `'unsafe-inline'` solo en script si es imprescindible.
3. **Resume = re-download:** no reanuda bytes; suficiente para Fase 2. Post-cierre: fallos de reintento ya no vacían el snapshot en silencio (banner + filas restantes).
4. **Playwright:** no cubre IPC Tauri; el smoke real sigue siendo `npm run tauri -- dev` / `smoke:windows` / acceso directo splash.
5. **Firma:** unsigned por defecto hasta certificado.
6. **Portable:** no hay ZIP portable en Fase 2 (solo MSI/NSIS + `.exe` release).
7. **Iconos:** splash/acceso directo usan `assets/clip-harbour-app-icon.*`; el embebido Tauri sigue en `src-tauri/icons/` (diseño distinto hasta regenerar).
8. **Historial git:** blobs grandes de sidecars Linux/macOS antiguos pueden seguir en la historia (tip limpio).

## Evidencia automática

- Vitest: `queue_snapshot`, `cookies_prefs` (file wins), `download_history` — 12/12 OK (2026-07-25).
- `cargo check` tras split de módulos.
- GitHub Actions CI (`test-linux` + `check-windows`) success on `main` (2026-07-25).

## Evidencia smoke manual (2026-07-25)

| Check | Resultado |
|-------|-----------|
| Cookies Netscape `cookies_merged.txt` (~23 KB, 119 líneas) | OK |
| `yt-dlp` search `ytsearch1:test` con `--cookies` (sin bot-check) | OK |
| Descarga corta → `C:\Users\rodri\Music\MEmu Music\smoke_phase2.webm` (EXIT 0) | OK |
| Descargas previas en app Tauri (cookies + ffmpeg → `.m4a` en MEmu Music) | OK (logs `tauri dev`) |
| Abrir fichero (`Start-Process` + ACL `C:/Users/*/Music/**`) | OK |
| Secretos (`.env` / cookies reales) fuera de `git status` | OK |
| Banner “Reanudar N pendientes” → Reintentar (re-download) | OK (confirmado en ventana nativa) |

## Cierre

Fase 2 cerrada: código, docs y smoke manual (cookies Method A, descarga, open file, resume tras reinicio). CI en Actions verde. Release workflow alineado con `CARGO_TARGET_DIR` del runner.
