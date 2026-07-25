# Cookies de YouTube en Clip Harbour

Guía para usar cookies con **yt-dlp** desde Clip Harbour cuando YouTube bloquea búsquedas o descargas.

Referencia oficial: [Exporting YouTube cookies (yt-dlp wiki)](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)

Setup rápido Fase 2: [PHASE2_SETUP.md](../PHASE2_SETUP.md).

---

## ¿Para qué sirven?

Las cookies permiten que **yt-dlp** actúe como si tuviera una sesión de navegador válida en YouTube. En Clip Harbour se usan en:

- Búsqueda (`get_top_search`)
- Detalle de URL (`get_url_details`)
- Descargas (`start_download`)

**No son obligatorias** para todo el contenido público. Sí suelen hacer falta cuando:

- Aparece *“Sign in to confirm you're not a bot”*
- El vídeo tiene restricción de edad
- Es contenido solo para miembros o listas privadas
- La búsqueda devuelve cero resultados sin error claro

---

## Cómo las configura la app (Fase 2)

En la **barra lateral** (sidebar expandida), sección **YouTube cookies**:

| Control | Qué hace |
|---------|----------|
| **Elegir cookies.txt** | Abre un archivo `.txt` (formato Netscape) y pasa `--cookies <ruta>` a yt-dlp. |
| **Quitar archivo** | Borra la ruta guardada. |

La preferencia se guarda en `localStorage` (`clip_harbour_cookies_file`). Si existía una selección legacy “desde el navegador”, la app la limpia al abrir la sección para no enviar dos flags a yt-dlp.

### Backend (Rust)

`append_cookie_args` añade los argumentos a yt-dlp. Variables de entorno **antes de arrancar la app**:

| Variable | Equivalente |
|----------|-------------|
| `CLIP_HARBOUR_COOKIES` | Ruta al archivo `cookies.txt` |
| `CLIP_HARBOUR_COOKIES_FROM_BROWSER` | Nombre del navegador (`firefox`, `chrome`, …) — avanzado, sin UI |

Si hay archivo en la UI, el frontend **no** envía `cookies_from_browser`.

---

## Método A (recomendado / oficial Fase 2): exportar `cookies.txt`

YouTube **rota las cookies** si las exportas desde pestañas normales abiertas. yt-dlp recomienda:

1. Abre una ventana **privada / incógnito** e inicia sesión en YouTube.
2. En **esa misma pestaña** (y sin otras pestañas privadas abiertas), visita solo:  
   `https://www.youtube.com/robots.txt`
3. Exporta las cookies de `youtube.com` con una **extensión del navegador** (formato Netscape → archivo `.txt`).
4. **Cierra** la ventana privada.
5. Guarda el archivo fuera del repo y fuera de sync (p. ej. `C:\Users\rodri\cookies_youtube\cookies_chrome.txt`).
6. Clip Harbour → sidebar → **Elegir cookies.txt**.

### Lo que NO debes hacer

- **No** uses `--cookies COOKIEFILE --cookies-from-browser BROWSER` para *generar* el archivo desde incógnito.
- No uses la plantilla del repo como cookies reales: [`cookies.txt.example`](./cookies.txt.example).
- Extensiones: [FAQ de yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp).

---

## Avanzado: cookies desde el navegador (sin UI)

El desplegable “Desde el navegador” está **oculto** en Fase 2. Para forzarlo sin archivo, usa `CLIP_HARBOUR_COOKIES_FROM_BROWSER` en el entorno del proceso. En Windows, Chrome/Edge suelen fallar; Firefox suele ser más fiable. Preferible siempre el archivo `.txt`.

---

## Riesgos y buenas prácticas

> **Advertencia (yt-dlp):** usar tu cuenta con yt-dlp puede conllevar **bloqueo temporal o permanente** de la cuenta.

- Usa cookies **solo cuando haga falta**.
- Considera una **cuenta secundaria** si descargas mucho.
- Mantén **yt-dlp actualizado**: `npm run fetch:sidecars:windows`

---

## Errores frecuentes

### “Sign in to confirm you're not a bot”

1. Reexporta cookies (método incógnito + extensión).
2. Configúralas en la sidebar.
3. Actualiza yt-dlp si el error persiste.

En descargas, Fase 2 reintenta automáticamente 403 hasta 2 veces si hay cookies configuradas.

### “This content isn't available, try again later”

Rate limit de YouTube. Espera o reduce la frecuencia.

### “No search results” / búsqueda vacía

Puede ser cookies inválidas, query sin resultados, o bloqueo. Prueba cookies + otra búsqueda + yt-dlp reciente.

### OAuth

**El login OAuth de YouTube ya no funciona con yt-dlp.** Usa cookies (archivo).

---

## PO Token (YouTube reciente)

Las cookies **no sustituyen** un PO Token. Ver [PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide). Clip Harbour no expone PO Token en la UI.

---

## Resumen rápido (Windows)

1. Firefox → ventana privada → login YouTube → `youtube.com/robots.txt` → exportar `cookies.txt`.
2. Clip Harbour → sidebar → **Elegir cookies.txt**.
3. Si sigue fallando: `npm run fetch:sidecars:windows` y reintenta.
4. Setup Fase 2: [PHASE2_SETUP.md](../PHASE2_SETUP.md) · contexto fork: [WINDOWS.md](./WINDOWS.md).

---

## Enlaces útiles

- [Extractors — Exporting YouTube cookies](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
- [FAQ — How do I pass cookies to yt-dlp?](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)
- [PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
