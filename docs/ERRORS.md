# Biblioteca de errores

Los errores viajan con una forma estable `{ code, message, detail }` desde el backend
Rust hasta la UI, en lugar de volcar el stderr crudo de yt-dlp.

## Origen y formato

- **Backend**: `src-tauri/src/errors.rs` define `AppError` (serializado `camelCase`)
  y el diccionario de códigos `errors::codes`. Los comandos Tauri devuelven
  `Result<T, AppError>`.
- **Clasificación**: `format_ytdlp_error` (`src-tauri/src/ytdlp.rs`) convierte el
  stderr de yt-dlp en un `AppError`: mensaje corto y accionable en `message`, y la
  línea `ERROR:` original en `detail`.
- **Frontend**: `src/lib/app_errors.js` normaliza el error (`parseAppError`) y
  produce el mensaje más amigable (`friendlyError`), con esta precedencia:
  1. Traducción i18n `errors.<code>` (`src/i18n/locales/*.json`).
  2. Fallback por código en `ERROR_FALLBACKS`.
  3. Mensaje del backend (si el código es `INTERNAL`, siempre se usa el mensaje
     real antes que el genérico).
  4. `detail` técnico al final, si existe.

## Códigos

| Código | Significado |
| --- | --- |
| `COOKIES_INVALID` | El archivo de cookies no es Netscape válido (p. ej. pega robots.txt). |
| `COOKIES_NO_SESSION` | Cookies sin sesión YouTube (faltan SID/HSID). |
| `COOKIES_FILE_NOT_FOUND` | Ruta de cookies inexistente. |
| `RATE_LIMIT` | YouTube limitó la sesión (~1 h). |
| `AUTH_BLOCK` | YouTube pide confirmar que no eres un bot. |
| `DIR_ACCESS` | No se pudo crear/usar la carpeta de descarga (WinError 5). |
| `NO_RESULTS` | Búsqueda sin resultados. |
| `YTDLP_SPAWN` | Falló al lanzar yt-dlp (binario embebido no disponible o corrupto). |
| `YTDLP_FAILED` | yt-dlp falló (causa en `detail`). |
| `NO_DATA` | yt-dlp no devolvió datos. |
| `PARSE_JSON` | Respuesta JSON de yt-dlp ilegible. |
| `INTERNAL` | Error no clasificado (mensaje original conservado). |

## Mantenimiento

Al añadir o renombrar un código, actualiza en paralelo:

1. `src-tauri/src/errors.rs` (`codes`).
2. `src/lib/app_errors.js` (`ERROR_FALLBACKS`).
3. `errors.*` en `src/i18n/locales/es.json`.

## Deuda conocida (baseline pre-limpieza)

Registrada el 2026-08-24 como parte del baseline `f0-baseline` (antes de la
reorg de scripts). No son regresiones de la limpieza, sino deuda pre-existente.
Estado el 2026-08-24: **resuelto en `f0-verify`**.

- ~~**`e2e/smoke.spec.js` — "language toggle is visible in sidebar when
  expanded"**: el test esperaba botones `ES`/`EN` en el sidebar, pero el refactor
  eliminó el toggle de idioma.~~ **Resuelto**: el test ahora verifica los tabs
  Queue/History del sidebar real (`src/components/menu/sidebar.jsx`).
- ~~**`e2e/smoke.spec.js` — "player mode route renders search chrome"**: el test
  navegaba a `/player` sin `VITE_ENABLE_PLAYER=1`, por lo que la ruta no
  existía.~~ **Resuelto**: `playwright.config.js` arranca Vite con
  `VITE_ENABLE_PLAYER=1` (igual que la build móvil), y el test cubre la ruta
  `/player` en verde.
