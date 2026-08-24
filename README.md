<div align="center">
<h1>Clip Harbour</h1>
 
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-blue)](https://v2.tauri.app/)

</div>

## Resumen
Clip Harbour es una interfaz gráfica multiplataforma, sencilla y completa, para descargar vídeo y audio de sitios como YouTube. Está construida con [Tauri](https://github.com/tauri-apps/tauri) (**v2**) y se apoya en [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) y [`ffmpeg`](https://www.ffmpeg.org/), ofreciendo un frontend cómodo sobre una de las herramientas de descarga más potentes.

Mira el [vídeo de demostración](https://www.youtube.com/watch?v=VYv4jSYCPak).

> **Windows (este fork):** hay release [v0.1.0](https://github.com/AntonioRodriguezSmith/music/releases/tag/v0.1.0) (MSI / NSIS / [portable](docs/PORTABLE_README.txt)). Upstream sigue siendo Linux-only. Build local: [docs/WINDOWS.md](docs/WINDOWS.md). Setup Fase 3: [docs/PHASE3_SETUP.md](docs/PHASE3_SETUP.md).

# Índice

- [Motivación](#motivación)
- [Funciones](#funciones)
- [Uso](#uso)
- [Desarrollo](#configuración-de-desarrollo)
- [Windows](#desarrollo-en-windows)
- [Licencia](#licencia)

## Motivación
Aunque `yt-dlp` es muy potente, su uso por línea de comandos puede resultar difícil para principiantes. Este proyecto nace para acortar esa distancia.

Existen otros frontends como [ezytdl](https://github.com/sylviiu/ezytdl) o [youtube-dl-gui](https://github.com/jely2002/youtube-dl-gui), pero muchos están desactualizados, poco mantenidos o no aprovechan bien `yt-dlp`. El objetivo es ofrecer una alternativa moderna y con más funciones:

- **Compatibilidad:** Clip Harbour usa [Tauri](https://github.com/tauri-apps/tauri), un framework multiplataforma que permite ejecutarse en Windows, Linux y macOS.
- **Tamaño:** a diferencia de Electron, Tauri usa el motor web del sistema y el binario queda más ligero.
- **Funciones:** se intenta exponer el mayor número posible de capacidades de `yt-dlp`. La lista está en [Funciones](#funciones) (¡PRs bienvenidos!).

## Funciones
  * Integración con `yt-dlp`: descargas en paralelo y múltiples opciones de descarga.
  * Búsqueda en YouTube además de pegar URLs concretas.
  * **Historial de búsqueda** — últimas 15 consultas/URLs correctas bajo la barra de búsqueda.
  * **Historial de descargas** — ítems terminados en la pestaña **Historial** de la sidebar; exportar `.txt`.
  * Resultados de búsqueda: hasta **50** hits (`ytsearch50`), opcional **Cargar 50 más** (hasta 100); **filas por página medidas una vez** al mostrar resultados (8–30), luego congeladas al redimensionar; vista previa al pasar el ratón con enriquecimiento opcional vía `get_url_details`.
  * **Cookies de YouTube:** elige un `cookies.txt` Netscape en la sidebar (ver [docs/PHASE2_SETUP.md](docs/PHASE2_SETUP.md)).
  * **Reanudar cola:** las descargas pendientes se guardan entre reinicios (banner de re-descarga). El historial puede **abrir** el fichero terminado.
  * Barra de búsqueda: marco redondeado con borde negro; botón negro e icono de lupa blanco (el spinner se detiene al llegar los primeros resultados).
  * Una búsqueda nueva cancela la anterior de yt-dlp y sustituye los resultados al momento.
  * **Descarga múltiple** desde la búsqueda: varios vídeos; cada URL usa `bestaudio/best` (no un único format id compartido).
  * **Modos de descarga** (preferencia guardada en local):
    * **Standard** (por defecto) — elige el mejor audio; puedes cambiar formato/salida a mano.
    * **USB BMW** — mejor audio y conversión a **M4A** (MP3 opcional); metadatos activados / miniatura desactivada por defecto; se borra el fichero fuente tras convertir bien.
    * **PC** — mejor audio y se conserva el contenedor original (suele ser Opus/WebM) sin re-encode.
  * **Selector de formatos:** primero los streams útiles (audio/vídeo reales); columnas Formato / Tipo / Calidad / Tamaño; **Mostrar todos** incluye mhtml/storyboard; paginación si hay más de 12 formatos.
  * Panel **Datos clave** con campos legibles y traducidos (códec, bitrate, frecuencia, resolución, tamaño) en lugar de claves JSON crudas.
  * Idioma de la UI **ES / EN** (español por defecto); preferencia guardada en local.
  * Ventana sin decoración nativa, estilo iTunes: shell redondeado, titlebar con degradado, controles circulares a la derecha.
  * Sidebar de cola con pestañas **Cola | Historial**, paginación, limpiar terminados, **cancelar todas**, abrir carpeta / fichero; máximo **2** descargas en paralelo (`queued` para el resto).
  * **Buscar actualizaciones** (updater Tauri vía GitHub Releases).
  * **Portable ZIP** Windows (`clip_harbour-portable-win64.zip`) — sin instalador; ver [docs/PORTABLE_README.txt](docs/PORTABLE_README.txt).
  * Integración con `ffmpeg` para conversión bajo demanda; la barra usa 0–70 % descarga / 70–100 % conversión cuando hay convert.
  * Estadísticas de progreso: velocidad, ETA, tamaño, bytes descargados, etc.
  * Incrustar miniaturas y subtítulos en el fichero.
  * Notas del fork: [docs/PHASE3.md](docs/PHASE3.md), [docs/PHASE3_SETUP.md](docs/PHASE3_SETUP.md), [docs/WINDOWS.md](docs/WINDOWS.md), [docs/CHANGELOG_FORK.md](docs/CHANGELOG_FORK.md), [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).
  * Desarrollo aparte (no publicado): modo Player Fase 4 en [docs/DEV_PHASE4.md](docs/DEV_PHASE4.md).

## Uso
**Este fork (Windows):** descarga [v0.1.0](https://github.com/AntonioRodriguezSmith/music/releases/tag/v0.1.0) — MSI, instalador NSIS o ZIP portable ([instrucciones](docs/PORTABLE_README.txt)). Authenticode no incluido (uso personal); detalle en [docs/PHASE3_SETUP.md](docs/PHASE3_SETUP.md).

> La release **v0.1.0** corresponde a la **Fase 3** (vista **Descarga**). En producción solo hay hasta la Fase 3. El modo Player (Fase 4) es un desarrollo aparte **aún no publicado**: ver [docs/DEV_PHASE4.md](docs/DEV_PHASE4.md).

Upstream (Linux y builds originales): [releases de clip_harbour](https://github.com/amansxcalibur/clip_harbour/releases). Las versiones con sufijo `_python` requieren Python.

En la app de escritorio (ventana nativa con `npm run tauri -- dev` / `npm run dev:windows`). En Windows: acceso directo **Clip Harbour** del Escritorio con splash — [docs/LAUNCHER_WINDOWS.md](docs/LAUNCHER_WINDOWS.md).
- Usa el control **ES | EN** en la sidebar para cambiar el idioma.
- Busca o pega una URL de YouTube. Navega con Anterior / Siguiente (filas por página fijadas tras el primer layout). Pasa el ratón ~400 ms sobre una fila para ver miniatura y metadatos.
- Marca vídeos y pulsa **Configurar descarga**, o abre un resultado concreto.
- En la pantalla de descarga, elige un **modo**:
  - **Standard** (por defecto): mejor audio; cambia formato/salida si quieres.
  - **USB BMW**: mejor audio y conversión a **M4A** (MP3 opcional). Tras convertir bien, se borra el fichero fuente temporal.
  - **PC**: mejor audio en Opus/WebM sin conversión — no pensado para USB del coche.
- Expande **Formatos disponibles** / **Datos clave** según necesites.
- **Nota bulk:** la descarga múltiple usa `bestaudio/best` por URL.
- Elige carpeta de descarga y **cookies.txt** (Método A) en la sidebar — [docs/PHASE2_SETUP.md](docs/PHASE2_SETUP.md).
- Sidebar **Cola | Historial**: cancelar todas, abrir carpeta/fichero, exportar historial. Tras reinicio con pendientes: **Reanudar** → Reintentar.

## Configuración de desarrollo
### Requisitos
Asegúrate de tener instalado:
- [Node.js y npm](https://nodejs.org/)
- [Python](https://www.python.org/) (necesario para el sidecar `yt-dlp` en algunas builds Linux; el `.exe` de Windows no lo necesita)
- [Rust y Cargo](https://www.rust-lang.org/tools/install) (necesario para la CLI de Tauri)

Usa la documentación de **[Tauri 2](https://v2.tauri.app/)**, no la de [Tauri 1](https://v1.tauri.app/).

### Pasos
1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/AntonioRodriguezSmith/music
   cd music
   ```
2. **Instalar dependencias**:
   ```bash
   npm install
   ```
3. **Instalar la CLI de Tauri** (si no la tienes):
   ```bash
   cargo install tauri-cli
   ```
4. **Arrancar el servidor de desarrollo** (solo frontend — el IPC no funciona en un navegador normal):
   ```bash
   npm run dev
   ```
5. **Arrancar la aplicación Tauri** (ventana nativa):
   ```bash
   npm run tauri -- dev
   ```

## Desarrollo en Windows

Notas y changelog: **[docs/WINDOWS.md](docs/WINDOWS.md)**. Fase 3: **[docs/PHASE3.md](docs/PHASE3.md)**.

```powershell
npm install
npm run fetch:sidecars:windows
npm run test                 # tests unitarios (vitest)
npm run test:e2e             # Playwright contra Vite (sin IPC Tauri)
npm run smoke:windows        # sidecars --version + tests unitarios
# opcional: copiar .env.example → .env y definir VITE_DEFAULT_DOWNLOAD_PATH
# cookies: ver docs/PHASE2_SETUP.md
npm run dev:windows
npm run launch:windows       # splash Escritorio; prefer .exe release (sin Cursor)
npm run install:shortcut:windows  # recrea Clip Harbour.lnk
npm run tauri -- build       # .exe standalone + MSI/NSIS en %LOCALAPPDATA%\clip_harbour-target\release\
npm run pack:portable:windows     # ZIP portable (tras build)
# Authenticode opcional (hace skip si no hay cert en el entorno):
npm run sign:windows
```

Requisitos: toolchain MSVC portable (via [msvcup](https://github.com/marler8997/msvcup), **sin Visual Studio**), Windows SDK, WebView2. El launcher pone `CARGO_TARGET_DIR` bajo `%LOCALAPPDATA%` para no escribir builds en carpetas sincronizadas (p. ej. Proton Drive). Artefactos: `%LOCALAPPDATA%\clip_harbour-target\release\bundle\` (ver [docs/PHASE3_SETUP.md](docs/PHASE3_SETUP.md), [docs/WINDOWS.md](docs/WINDOWS.md)).

Usa siempre la **ventana de la app de escritorio** para probar búsqueda y descarga.

Si ves `cargo metadata: program not found`, abre una **terminal nueva** (el PATH se define en `.vscode/settings.json`) o ejecuta `npm run tauri -- dev` / `npm run dev:windows`.

Resumen Fase 3: **[docs/PHASE3.md](docs/PHASE3.md)**. Resumen Fase 2: **[docs/PHASE2.md](docs/PHASE2.md)**. Cierre Fase 1: **[docs/PHASE1.md](docs/PHASE1.md)**.

## Licencia
Este proyecto está bajo la licencia GNU GPL-3.0. Puedes usar, modificar y distribuir el software según los términos de la [licencia GPL-3.0](./LICENSE.md).
