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

> **Autodetección (desde este fork):** al iniciar la app, si aún no tienes ninguna cookie configurada, Clip Harbour escanea automáticamente la carpeta `C:\Users\<usuario>\cookies_youtube` y, si hay algún `.txt`, selecciona el más probable (prioridad: `cookies_merged` → `cookies_chrome`/`cookies_edge`/`cookies_firefox`/`cookies.txt` → otras) y lo persiste. La carpeta de escaneo se puede cambiar con la variable `CLIP_HARBOUR_COOKIES_DIR`. Si el `.txt` está en otro sitio o la autodetección se salta el archivo correcto, elige el archivo a mano en la sidebar.
>
> **BOM tolerado (desde este fork):** si el archivo de cookies se guardó con un **BOM UTF-8** al principio (algo que `yt-dlp` rechaza con *does not look like a Netscape format cookies file*), la app lo detecta automáticamente y genera una copia limpia `<nombre>.nobom.txt` al lado del original, usándola al descargar. No necesitas re-exportar por este motivo.
>
> **Auto-refresh desde Firefox (desde este fork):** al iniciar la app, Clip Harbour extrae automáticamente las cookies de sesión de **Firefox** con `yt-dlp --cookies-from-browser firefox`, las filtra/enriquece en Rust (solo dominios YouTube/Google, dedupe conservando la expiración más reciente, UTF-8 sin BOM, dominios con `.` marcados `TRUE`) y las escribe en `C:\Users\<usuario>\cookies_youtube\cookies_merged.txt`, que queda seleccionado automáticamente. Esto evita el `403: revisa cookies de YouTube en el panel lateral` por cookies caducas. Si Firefox no tiene sesión (o falla la extracción), la app conserva el archivo previo y muestra un aviso en la sidebar.
>
> **Seguridad:** este auto-refresh deja cookies reales de sesión en texto plano en `cookies_merged.txt`. Evita poner esa carpeta en sincronización (Proton Drive/OneDrive) o compartirla.

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

1. `npm run tauri -- dev` o `npm run launch:windows` (splash + acceso directo; ver [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md)). Ventana nativa; no el browser en `:1420`.
2. Sidebar: archivo `cookies.txt` seleccionado (o autodetectado al iniciar desde `cookies_youtube`).
3. Buscar un término corto → resultados sin “Sign in to confirm you're not a bot”.
4. Una descarga de prueba; en Historial, **Abrir** el fichero.
5. Opcional cola: encola → cierra la app → reabre → banner **Reanudar N pendientes** → Reintentar.
6. `git status`: ni `.env` ni `cookies.txt` deben aparecer.

## Riesgos

- Usar la cuenta con yt-dlp puede conllevar bloqueo (aviso yt-dlp). Preferible cuenta secundaria con mucho volumen.
- Usa cookies solo cuando haga falta (bot-check / 403).
- Mantén yt-dlp al día: `npm run fetch:sidecars:windows`.
