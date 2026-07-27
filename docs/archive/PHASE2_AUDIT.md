# Fase 2 — auditoría

**Veredicto: Fase 2 IMPLEMENTADA** (smoke manual revalidado 2026-07-27: cookies + búsqueda + descarga + open-file; resume por código/UI previa).

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
9. **Cookies Edge crudas:** `cookies_edge.txt` puede tener flags Netscape inconsistentes; usar `cookies_merged.txt` (o regenerar con `filter-youtube-cookies.ps1`).
10. **yt-dlp sin JS runtime:** warning EJS/deno; descarga corta OK; formatos pueden faltar en algunos vídeos — instalar runtime si hace falta.

## Evidencia automática

- Vitest: 14 files / 51 tests OK (2026-07-27), incl. `queue_snapshot`, `cookies_prefs`, `download_history`.
- `npm run smoke:windows` OK (2026-07-27).
- `cargo check` OK (2026-07-27).
- GitHub Actions CI (`test-linux` + `check-windows`) success on `main` (2026-07-25).

## Evidencia smoke manual

### 2026-07-25 (cierre inicial)

| Check | Resultado |
|-------|-----------|
| Cookies Netscape `cookies_merged.txt` | OK |
| `yt-dlp` search `ytsearch1:test` con `--cookies` | OK |
| Descarga → `smoke_phase2.webm` en MEmu Music | OK |
| Abrir fichero + ACL `Music/**` | OK |
| Banner “Reanudar N pendientes” en ventana nativa | OK |

### 2026-07-27 (revalidación)

| Check | Resultado |
|-------|-----------|
| `cookies_merged.txt` Netscape, sin BOM, 119 cookies, 0 issues estructurales | OK |
| `ytsearch1:test` + cookies → `SEARCH_OK` (id `YXZH-eBtmqQ`) | OK |
| Descarga corta → `C:\Users\rodri\Music\MEmu Music\smoke_phase2_recheck.webm` (EXIT 0, ~246 KiB) | OK |
| `Start-Process` fichero + Explorer `/select` | OK |
| ACL path match `C:/Users/*/Music/**` | OK |
| Código resume (`resumePending` / snapshot / banner sidebar) | OK (presente; UI ya confirmada 2026-07-25) |
| `npm run smoke:windows` + Vitest 51 + `cargo check` | OK |

## Cierre

Fase 2 cerrada: código, docs y smoke (cookies Method A, descarga, open file, resume). Revalidación 2026-07-27 confirma cookies/search/download/open. Preferir `cookies_merged.txt` en la sidebar.
