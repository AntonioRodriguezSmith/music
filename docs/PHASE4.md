# Fase 4 — Player

**Estado:** MVP en PR [#1](https://github.com/AntonioRodriguezSmith/music/pull/1)  
**Links:** [SETUP](./PHASE4_SETUP.md) · [SPEC](./phase4/SPEC.md) · [CHECKLIST](./PHASE4_CHECKLIST.md) · [AUDIT](./PHASE4_AUDIT.md) · [PLAYER_PLAYLISTS](./PLAYER_PLAYLISTS.md) (post-MVP + P10 a–c/e)

**Objetivo:** mismo exe, dos vistas — Descarga intacta + Player ligero (reproducir, listas, Descargar audio). Detalle técnico en SPEC.

## Mapa

| ID | Nombre | Doc | Estado | Depende |
|----|--------|-----|--------|---------|
| P0 | Docs scaffold | [P0_DOCS](./phase4/P0_DOCS.md) | hecho | — |
| P1 | Shell dual | [P1_SHELL](./phase4/P1_SHELL.md) | hecho | P0 |
| P2 | UI chrome | [P2_UI_CHROME](./phase4/P2_UI_CHROME.md) | hecho | P1 |
| P3 | Search Player | [P3_SEARCH](./phase4/P3_SEARCH.md) | hecho | P2 |
| P4 | Cache backend | [P4_CACHE](./phase4/P4_CACHE.md) | hecho | P2 |
| P5 | Play FE | [P5_PLAY](./phase4/P5_PLAY.md) | hecho | P4 |
| P6 | Playlists | [P6_PLAYLISTS](./phase4/P6_PLAYLISTS.md) | hecho | P2 |
| P7 | Descargar audio | [P7_DOWNLOAD_AUDIO](./phase4/P7_DOWNLOAD_AUDIO.md) | hecho | P2 |
| P8 | Polish | [P8_POLISH](./phase4/P8_POLISH.md) | hecho | P3–P7 |
| P9 | Closeout | [P9_CLOSEOUT](./phase4/P9_CLOSEOUT.md) | hecho | P0–P8 |

## Cierres

### P0 — Docs scaffold (hecho 2026-07-28)
- Entrega: hub, SPEC, SETUP, CHECKLIST, P0–P9
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P0_DOCS.md](./phase4/P0_DOCS.md)

### P1 — Shell (hecho 2026-07-28)
- Entrega: `app_mode.js`, toggle titlebar, ruta `/player`, i18n
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P1_SHELL.md](./phase4/P1_SHELL.md)

### P2 — UI chrome (hecho 2026-07-28)
- Entrega: `PlayerPage` layout video + lista; sidebar compacta al entrar
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P2_UI_CHROME.md](./phase4/P2_UI_CHROME.md)

### P3 — Search (hecho 2026-07-28)
- Entrega: search en Player; play/add; sin `/val`
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P3_SEARCH.md](./phase4/P3_SEARCH.md)

### P4 — Cache (hecho 2026-07-28)
- Entrega: `purpose=cache`, merge ≤720p, `player_cache_dir` / purge, CSP media-src
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P4_CACHE.md](./phase4/P4_CACHE.md)

### P5 — Play (hecho 2026-07-28)
- Entrega: `convertFileSrc` + `<video>`, LRU purge, prefetch-1, espera cola
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P5_PLAY.md](./phase4/P5_PLAY.md)

### P6 — Playlists (hecho 2026-07-28)
- Entrega: `playlists.js` localStorage + UI lista next/prev
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P6_PLAYLISTS.md](./phase4/P6_PLAYLISTS.md)

### P7 — Descargar audio (hecho 2026-07-28)
- Entrega: CTA → bestaudio + historial
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P7_DOWNLOAD_AUDIO.md](./phase4/P7_DOWNLOAD_AUDIO.md)

### P8 — Polish (hecho 2026-07-28)
- Entrega: i18n player, TROUBLESHOOTING, vitest app_mode/playlists, e2e `/player`
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P8_POLISH.md](./phase4/P8_POLISH.md)

### P9 — Closeout (hecho 2026-07-28)
- Entrega: AUDIT + checklist + CHANGELOG cierre; PR #1
- PR: #1 — https://github.com/AntonioRodriguezSmith/music/pull/1
- Doc: [phase4/P9_CLOSEOUT.md](./phase4/P9_CLOSEOUT.md)
