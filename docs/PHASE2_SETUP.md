# Fase 2 — Setup local

Checklist para dejar Clip Harbour listo en Windows con **Método A** (archivo `cookies.txt`). No commits secrets: `.env` y `cookies.txt` están en `.gitignore`.

## 1. Variables de entorno

1. Copia [`.env.example`](../.env.example) → `.env` en la raíz del proyecto.
2. Pon una ruta real de descargas, p. ej. `VITE_DEFAULT_DOWNLOAD_PATH=C:\Users\rodri\Music\MEmu Music`.
3. Opcional: `CLIP_HARBOUR_COOKIES=C:\Users\rodri\cookies_youtube\cookies_chrome.txt` (o `cookies_edge.txt`) como fallback de proceso; la sidebar también guarda la ruta en `localStorage`.

## 2. Cookies YouTube — Método A (oficial Fase 2)

La UI de la sidebar solo ofrece **Elegir cookies.txt**. No uses el selector “Desde el navegador” (oculto).

**Importante:** no uses el navegador embebido de Cursor. Usa Firefox o Chrome/Edge del sistema.

1. Instala una extensión que exporte cookies Netscape (p. ej. “Get cookies.txt LOCALLY”; ver [FAQ yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)).
2. Abre una ventana **privada / incógnito**.
3. Inicia sesión en YouTube solo en esa ventana.
4. Visita únicamente `https://www.youtube.com/robots.txt` (sin otras pestañas privadas de YouTube).
5. Exporta cookies de `youtube.com` → `.txt`.
6. Guarda el archivo **fuera del repo** y fuera de carpetas sincronizadas (Proton Drive, OneDrive…), p. ej.  
   `C:\Users\rodri\cookies_youtube\cookies_chrome.txt` o `cookies_edge.txt`.
7. Cierra la ventana privada.
8. **Recomendado:** filtra / unifica solo YouTube+Google (UTF-8 **sin BOM**; yt-dlp falla con BOM y con cookies rotas de otros sitios):

```powershell
# Unificar Edge + Chrome → cookies_merged.txt
.\scripts\filter-youtube-cookies.ps1 -InputPath @(
  "C:\Users\rodri\cookies_youtube\cookies_edge.bak.txt",
  "C:\Users\rodri\cookies_youtube\cookies_chrome.bak.txt"
) -OutputPath "C:\Users\rodri\cookies_youtube\cookies_merged.txt"
```

9. En Clip Harbour: sidebar → **Elegir cookies.txt** → `C:\Users\rodri\cookies_youtube\cookies_merged.txt`.

Plantilla de formato (no usable como cookies reales): [`cookies/cookies.txt.example`](./cookies/cookies.txt.example).  
Detalle ampliado: [`cookies/cookies_info.md`](./cookies/cookies_info.md).

### No hacer

- No rellenar a mano la plantilla del repo con valores inventados.
- No guardar el HTML/texto de `youtube.com/robots.txt` como `cookies.txt` (eso no son cookies; yt-dlp dirá *does not look like a Netscape format cookies file*). La página robots.txt solo se visita para exportar cookies **con la extensión**.
- No combinar `--cookies` + `--cookies-from-browser` para generar el archivo desde incógnito.
- No subir `cookies.txt` a git.

Un `cookies.txt` válido empieza con `# Netscape HTTP Cookie File` (o similar) y líneas con columnas separadas por tab (`youtube.com`, `TRUE`, `/`, …), no con `User-agent:` / `Disallow:`.

## 3. Sidecars

```powershell
npm run fetch:sidecars:windows
```

## 4. Verificar

En desarrollo no hay icono de escritorio: usa la terminal.

1. `npm run tauri -- dev` (ventana nativa; no el browser en `:1420`).
2. Sidebar: archivo `cookies.txt` seleccionado.
3. Buscar un término corto → resultados sin “Sign in to confirm you're not a bot”.
4. Una descarga de prueba; en Historial, **Abrir** el fichero.
5. Opcional cola: encola → cierra la app → reabre → banner **Reanudar N pendientes** → Reintentar.
6. `git status`: ni `.env` ni `cookies.txt` deben aparecer.

## Riesgos

- Usar la cuenta con yt-dlp puede conllevar bloqueo (aviso yt-dlp). Preferible cuenta secundaria con mucho volumen.
- Usa cookies solo cuando haga falta (bot-check / 403).
- Mantén yt-dlp al día: `npm run fetch:sidecars:windows`.
