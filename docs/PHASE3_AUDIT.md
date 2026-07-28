# Fase 3 — auditoría

**Estado:** CERRADA (implementación + release 2026-07-28).

## Alcance

Distribución Windows (portable, iconos, shortcut), firma Authenticode opcional, auto-update vía GitHub Releases, UX cola/historial/búsqueda.

## Evidencia

| Ítem | Resultado |
|------|-----------|
| Portable ZIP | OK — `clip_harbour-portable-win64.zip` (~76 MB) bajo LocalAppData bundle/portable |
| Icons regen | OK — `npm run regen:icons`; eliminado `clip-harbour-launcher.ico` duplicado |
| Sign skip sin cert | OK — script exit 0 sin env; sin PFX en máquina ni secrets Authenticode |
| CI signing workflow | OK — PFX via Base64 secret → temp; log only `CLIP_HARBOUR_SIGNING_CONFIGURED` (2026-07-28) |
| Updater UI | Cableado (`UpdateChecker`); Release [v0.1.0](https://github.com/AntonioRodriguezSmith/music/releases/tag/v0.1.0) con `latest.json` firmado |
| Cancelar todas / historial | Implementado en sidebar + `removeDownloadHistoryItem` / `parentDirOf` |
| `npm test` | OK — 51 tests (2026-07-28) |
| `npm run check:rust` | OK (2026-07-28) tras limpiar cache corrupt + resume curl a crates.io |
| GitHub Release v0.1.0 | OK — MSI, NSIS, portable, exe, `.sig`, `latest.json`; Authenticode unsigned |

## Veredicto

**Fase 3 implementada y publicada.** Para uso personal: Authenticode **no** es necesario (no hay PFX gratuito de confianza). Updater Tauri ya usa `TAURI_SIGNING_PRIVATE_KEY`. Aplazado: cert OV/EV de pago; renombrado de la app.
