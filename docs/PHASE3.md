# Fase 3 — resumen

Distribución Windows (portable ZIP, iconos, shortcut), firma Authenticode, auto-update y UX de cola/historial/búsqueda.

**Estado:** implementada y publicada (2026-07-28). Release fork [v0.1.0](https://github.com/AntonioRodriguezSmith/music/releases/tag/v0.1.0) (updater firmado; Authenticode omitido a propósito para uso personal). Setup: [PHASE3_SETUP.md](./PHASE3_SETUP.md). Checklist: [PHASE3_CHECKLIST.md](./PHASE3_CHECKLIST.md). Auditoría: [PHASE3_AUDIT.md](./PHASE3_AUDIT.md).

**Aplazado:** compra de cert Authenticode; renombrado de la app (`productName` / exe / `identifier`).

## Hitos

| Hito | Contenido |
|------|-----------|
| **M0** | Scaffold docs + CHANGELOG |
| **M1** | Iconos CH unificados; ZIP portable; shortcut script; artifact en CI |
| **M2** | Firma Authenticode opcional en CI/local (`sign-windows.ps1`) |
| **M3** | `tauri-plugin-updater` + GitHub Releases + UI “Buscar actualizaciones” |
| **M4** | Cancelar todas; historial remove / abrir carpeta / pager; historial búsqueda en barra vacía |
| **M5** | Docs + TROUBLESHOOTING + smoke |

## Uso diario (Windows)

1. `npm run tauri -- build` (una vez o tras cambios).
2. `npm run install:shortcut:windows` → acceso directo **Clip Harbour** ([LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md)).
3. Opcional: `npm run pack:portable:windows`.
4. Opcional: `npm run updater:latest` + publicar Release en GitHub.

## Gate

```powershell
npm test
npm run smoke:windows
npm run pack:portable:windows   # requiere release build previo
npm run check:rust
```

Release CI: [`.github/workflows/release-windows.yml`](../.github/workflows/release-windows.yml) (MSI + NSIS + portable ZIP + `latest.json` firmado en Release; Authenticode opcional vía `CLIP_HARBOUR_PFX_BASE64` — [PHASE3_SETUP.md](./PHASE3_SETUP.md)).
