<div align="center">
<h1>Clip Harbour</h1>
 
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-blue)](https://v2.tauri.app/)

</div>

## Resumen
Clip Harbour es una interfaz gráfica multiplataforma, sencilla y completa, para descargar vídeo y audio de sitios como YouTube. Está construida con [Tauri](https://github.com/tauri-apps/tauri) (**v2**) y se apoya en [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) y [`ffmpeg`](https://www.ffmpeg.org/), ofreciendo un frontend cómodo sobre una de las herramientas de descarga más potentes.

Mira el [vídeo de demostración](https://www.youtube.com/watch?v=VYv4jSYCPak).

> **Windows:** las releases oficiales de GitHub del proyecto original son solo Linux. Este árbol incluye soporte para compilar y ejecutar en Windows — ver [docs/cookies/WINDOWS.md](docs/cookies/WINDOWS.md).

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
  * Sidebar de cola con pestañas **Cola | Historial**, paginación (6 por página), limpiar terminados, abrir carpeta; máximo **2** descargas en paralelo (`queued` para el resto).
  * Integración con `ffmpeg` para conversión bajo demanda; la barra usa 0–70 % descarga / 70–100 % conversión cuando hay convert.
  * Estadísticas de progreso: velocidad, ETA, tamaño, bytes descargados, etc.
  * Incrustar miniaturas y subtítulos en el fichero.
  * Notas del fork: [docs/PHASE2.md](docs/PHASE2.md), [docs/PHASE2_SETUP.md](docs/PHASE2_SETUP.md), [docs/PHASE1.md](docs/PHASE1.md) (Fase 1 cerrada), [docs/CHANGELOG_FORK.md](docs/CHANGELOG_FORK.md), [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Uso
Ve a la página de [releases](https://github.com/amansxcalibur/clip_harbour/releases) del proyecto original y descarga el binario de tu SO.

**Nota:** las versiones con sufijo `_python` requieren Python instalado.

**Usuarios Windows:** aún no hay release oficial para Windows — compila desde el código con la sección [Desarrollo en Windows](#desarrollo-en-windows).

En la app de escritorio (ventana nativa con `npm run tauri -- dev` / `npm run dev:windows` — **no hay icono** en el menú Inicio ni en el escritorio hasta que compiles e instales):
- Usa el control **ES | EN** en la sidebar para cambiar el idioma.
- Busca o pega una URL de YouTube (campo redondeado + botón negro). Navega con Anterior / Siguiente — las filas por página se fijan tras el primer layout de esa búsqueda (redimensionar no cambia cuántas URLs ves por página). Pasa el ratón ~400 ms sobre una fila para ver miniatura y metadatos a la derecha (enriquecidos con `get_url_details` si hace falta).
- Marca vídeos y pulsa **Configurar descarga**, o abre un resultado concreto (los formatos se cargan con `get_url_details`).
- En la pantalla de descarga, elige un **modo**:
  - **Standard** (por defecto): mejor audio; cambia formato/salida si quieres.
  - **USB BMW**: mejor audio y conversión a **M4A** (compatible USB BMW). Cambia a **MP3** si lo necesitas. Tras convertir bien, se borra el fichero fuente temporal.
  - **PC**: mejor audio en Opus/WebM sin conversión — no pensado para USB del coche.
- Expande **Formatos disponibles** para elegir un stream. Cabeceras Formato / Tipo / Calidad / Tamaño. Por defecto se listan los útiles; **Mostrar todos** incluye mhtml/storyboard. **Anterior / Siguiente** si hay más de doce formatos.
- **Nota bulk:** la descarga múltiple usa `bestaudio/best` por URL (no un único format id).
- Expande **Datos clave** para ver códec, bitrate, frecuencia de muestreo y tamaño del formato elegido (etiquetas en ES/EN).
- Elige carpeta de descarga y **cookies.txt** de YouTube (Método A) en la sidebar — ver [docs/PHASE2_SETUP.md](docs/PHASE2_SETUP.md).
- Sidebar **Cola | Historial**: paginación de cola, limpiar terminados, abrir carpeta, **abrir fichero terminado**, exportar historial. Tras un reinicio con pendientes: **Reanudar N pendientes** → Reintentar (re-descarga).

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

Notas y changelog: **[docs/cookies/WINDOWS.md](docs/cookies/WINDOWS.md)**.

```powershell
npm install
npm run fetch:sidecars:windows
npm run test                 # tests unitarios (vitest)
npm run test:e2e             # Playwright contra Vite (sin IPC Tauri)
npm run smoke:windows        # sidecars --version + tests unitarios
# opcional: copiar .env.example → .env y definir VITE_DEFAULT_DOWNLOAD_PATH
# cookies: ver docs/PHASE2_SETUP.md
npm run dev:windows
# instaladores de release (MSI + NSIS):
npm run tauri -- build
# Authenticode opcional (hace skip si no hay cert en el entorno):
npm run sign:windows
```

Requisitos: workload C++ de MSVC, Windows SDK, WebView2. El launcher pone `CARGO_TARGET_DIR` bajo `%LOCALAPPDATA%` para no escribir builds en carpetas sincronizadas (p. ej. Proton Drive). Artefactos: `%LOCALAPPDATA%\clip_harbour-target\release\bundle\` (ver [docs/PHASE1.md](docs/PHASE1.md)).

Usa siempre la **ventana de la app de escritorio** para probar búsqueda y descarga.

Si ves `cargo metadata: program not found`, abre una **terminal nueva** (el PATH se define en `.vscode/settings.json`) o ejecuta `npm run tauri -- dev` / `npm run dev:windows`.

Resumen Fase 2: **[docs/PHASE2.md](docs/PHASE2.md)**. Cierre Fase 1: **[docs/PHASE1.md](docs/PHASE1.md)**.

## Licencia
Este proyecto está bajo la licencia GNU GPL-3.0. Puedes usar, modificar y distribuir el software según los términos de la [licencia GPL-3.0](https://github.com/amansxcalibur/clip_harbour/blob/main/LICENSE.md).
