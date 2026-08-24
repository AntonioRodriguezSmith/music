# Fase 1 — resumen (cerrada)

**Estado:** CERRADA (2026-07-21)  
**Informe de auditoría:** [archive/PHASE1_AUDIT.md](./archive/PHASE1_AUDIT.md)  
**Checklist:** [archive/PHASE1_CHECKLIST.md](./archive/PHASE1_CHECKLIST.md)  
**Changelog del fork:** [CHANGELOG_FORK.md](./CHANGELOG_FORK.md)

## Qué incluye esta fase

Fork Windows de Clip Harbour (Tauri 2 + React + yt-dlp/ffmpeg) listo para uso diario en escritorio:

| Área | Entregado |
|------|-----------|
| Búsqueda | `ytsearch30`, cancelar búsqueda en curso, pageSize congelado al resize, paginación fija, barra redondeada (borde/botón negros, lupa blanca) |
| Resultados | Columnas alineadas, preview al hover (metadatos de listing), selección múltiple |
| Descarga | Modos Standard / USB BMW (→ M4A) / PC; cola max 2 + `queued`; progreso 0–70–100; stop estable |
| Cola / historial | Sidebar fuera de rutas (sobrevive navegación); Historial + export `.txt`; abrir carpeta |
| i18n | ES (default) / EN, 128 claves emparejadas |
| Calidad | Vitest (43 tests), `smoke:windows`, `cargo check`, build release MSI + NSIS |
| Docs | README, troubleshooting, cookies, este cierre de fase |

## Cómo desarrollar

```powershell
npm install
npm run fetch:sidecars:windows
npm run smoke:windows
npm run tauri -- dev          # o: npm run dev:windows
```

Siempre probar en la **ventana nativa** Tauri, no en el navegador (`localhost:1420`).

## Cómo generar instaladores Windows

Requisitos: toolchain MSVC portable (via msvcup, sin Visual Studio) + Windows SDK + WebView2 + sidecars (`npm run fetch:sidecars:windows`).

```powershell
npm run tauri -- build
```

El wrapper (`scripts/tauri-windows.ps1`) fija MSVC y `CARGO_TARGET_DIR` (por defecto `%LOCALAPPDATA%\clip_harbour-target` para no escribir en carpetas sincronizadas como Proton Drive).

Artefactos típicos:

| Tipo | Ruta relativa a `CARGO_TARGET_DIR` |
|------|--------------------------------------|
| Ejecutable | `release\clip_harbour.exe` |
| MSI | `release\bundle\msi\clip_harbour_0.1.0_x64_en-US.msi` |
| Setup NSIS | `release\bundle\nsis\clip_harbour_0.1.0_x64-setup.exe` |

Los instaladores de la auditoría del 2026-07-21 se generaron correctamente (sin firma de código; firmar → Fase 2).

## Gate de calidad local

```powershell
npm test
npm run smoke:windows
npm run tauri -- build
```

## Verificación funcional de cierre

- USB BMW: conversión a `.m4a` confirmada en carpeta de descarga del usuario.
- Abrir carpeta: Explorer sobre el directorio de descarga.
- Build release: MSI + NSIS con exit code 0.

## Qué no entra (Fase 2)

- Persistencia de cola entre reinicios
- Abrir el fichero terminado desde Historial
- Retry automático ante 403
- Preview enriquecido con `get_url_details` al hover
- CI (GitHub Actions) / E2E
- Partir el monolito `src-tauri/src/lib.rs`
- Firma de código del instalador
- Endurecer ACL `opener` y CSP

Detalle en [archive/PHASE1_AUDIT.md](./archive/PHASE1_AUDIT.md#phase-2-backlog).

## Enlaces rápidos

- Desarrollo Windows: [WINDOWS.md](./WINDOWS.md)
- Cookies YouTube: [cookies/cookies_info.md](./cookies/cookies_info.md)
- Problemas frecuentes: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
