# Fase 3 — checklist

Use the native window or the desktop shortcut (release `.exe`).

## M0 / docs

- [x] PHASE3.md / SETUP / CHECKLIST / AUDIT enlazados desde README e índice

## M1 Distribución

- [x] Iconos Tauri regenerados desde `assets/clip-harbour-app-icon.png`
- [x] `npm run pack:portable:windows` produce ZIP con exe + sidecars
- [x] `npm run install:shortcut:windows` crea `.lnk` en Escritorio
- [x] CI `release-windows.yml` sube portable ZIP

## M2 Firma

- [x] Sin secrets: `sign:windows` / CI skip exit 0
- [x] Con cert: MSI/NSIS/exe firmables vía mismo script (documentado)
- [x] CI: `CLIP_HARBOUR_PFX_BASE64` (no path local); log sin valores de secrets

## M3 Auto-update

- [x] Plugin updater + process registrados; permisos en capabilities
- [x] Sidebar: Buscar actualizaciones
- [x] Sin release firmado: mensaje claro, app no crashea

## M4 UX

- [x] Cola: Cancelar todas
- [x] Historial: borrar fila, abrir carpeta, paginación
- [x] Búsqueda vacía: historial de queries + limpiar resultados
- [x] Preview cache se invalida al cambiar cookies

## M5 Cierre

- [x] TROUBLESHOOTING actualizado
- [x] PHASE3_AUDIT con veredicto
