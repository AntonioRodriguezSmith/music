# Fase 4 — Setup

Requisitos: mismos que [WINDOWS.md](./WINDOWS.md). Probar **solo en ventana Tauri**.

## Cookies

Método A ([PHASE2_SETUP.md](./PHASE2_SETUP.md)). Sin cookies → cache/play puede 403 (mensaje claro en UI post-P5).

## Cache / carpeta Player

Path por defecto: `%USERPROFILE%\Music\MEmu video` (se resuelve al usuario actual)
Override opcional: `CLIP_HARBOUR_PLAYER_DIR` en el entorno.  

| Subpath | Uso |
|---------|-----|
| `.cache/` | Play efímero (se limpia al salir de Player) |
| `playlists/<slug>/` | Offline por lista al **Añadir** |
| (raíz) | Descargar vídeo (`purpose: keep`) |

Play vía `convertFileSrc` + `assetProtocol` (no opener).  
Detalle P10 (rate-limit / listas offline): [PLAYER_PLAYLISTS.md](./PLAYER_PLAYLISTS.md).

Scope asset ([Tauri 2](https://v2.tauri.app/es/security/asset-protocol/)): `requireLiteralLeadingDot: false` para que el WebView pueda cargar `Music/**/.cache/**` (el glob `**` no entra en carpetas `.…` por defecto). CSP: `media-src` con `asset:` + `http://asset.localhost` ([CSP](https://v2.tauri.app/es/security/csp/), [`convertFileSrc`](https://v2.tauri.app/es/reference/javascript/api/namespacecore/#convertfilesrc)).

## Rate-limit / yt-dlp pacing

| Env | Efecto |
|-----|--------|
| `CLIP_HARBOUR_YT_SLEEP=soft` | Default. Sleeps 0.75/1.5/4 s en descargas no-cache; gap cola 2 s |
| `CLIP_HARBOUR_YT_SLEEP=strict` | Sleeps 1.5/3/8 s; gap cola 4 s |

**Play (`purpose=cache`):** sin sleeps yt-dlp (arranque inmediato). El pacing entre jobs es solo el gap de cola.

En Player: prefetch opt-in (checkbox); se apaga si YouTube limita. Reproducir ítems **offline** mientras dure el rate-limit (~1 h).

## Smoke manual (P8/P9 + P10)

1. Toggle → Player  
2. Buscar vídeo  
3. Reproducir (cache → play; **no** debe auto-añadir a lista)  
4. Añadir → aparece en lista + archivo en `playlists/<slug>/`  
5. Crear lista inline / menú ⋯ (rename, vaciar, borrar)  
6. Next / ítem lista; badge offline o guardando  
7. **Descargar audio** → cola / historial (carpeta audio)  
8. Salir Player → `.cache` vacío; `playlists/` intacto  

## Dev

```powershell
npm run dev:windows
```
