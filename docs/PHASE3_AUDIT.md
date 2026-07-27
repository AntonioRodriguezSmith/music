# Fase 3 — auditoría

**Estado:** CERRADA (implementación 2026-07-28).

## Alcance

Distribución Windows (portable, iconos, shortcut), firma Authenticode opcional, auto-update vía GitHub Releases, UX cola/historial/búsqueda.

## Evidencia

| Ítem | Resultado |
|------|-----------|
| Portable ZIP | OK — `clip_harbour-portable-win64.zip` (~76 MB) bajo LocalAppData bundle/portable |
| Icons regen | OK — `npm run regen:icons`; eliminado `clip-harbour-launcher.ico` duplicado |
| Sign skip sin cert | OK — script exit 0 sin env |
| CI signing workflow | OK — PFX via Base64 secret → temp; log only `CLIP_HARBOUR_SIGNING_CONFIGURED` (2026-07-28) |
| Updater UI | Cableado (`UpdateChecker`); sin Release firmado muestra error usable |
| Cancelar todas / historial | Implementado en sidebar + `removeDownloadHistoryItem` / `parentDirOf` |
| `npm test` | OK — 51 tests (2026-07-28) |
| `npm run check:rust` | Network flake downloading crates.io (schannel); retry locally when online |

## Veredicto

**Fase 3 implementada.** Releases productivos requieren: (1) secrets Authenticode opcionales, (2) `TAURI_SIGNING_PRIVATE_KEY` para firmar updater + subir `latest.json` y NSIS a GitHub Releases. Re-ejecutar `npm run check:rust` / `tauri -- build` cuando crates.io responda para validar el enlace Rust de updater/process.
