# Documentación

Notas del fork y guías operativas:

- [PHASE2.md](./PHASE2.md) — **resumen Fase 2 (cerrada)**: cola, cookies Método A, CI, seguridad
- [PHASE2_SETUP.md](./PHASE2_SETUP.md) — setup local (`.env` + cookies.txt)
- [PHASE2_AUDIT.md](./PHASE2_AUDIT.md) — auditoría Fase 2 + evidencia smoke 2026-07-25
- [PHASE2_CHECKLIST.md](./PHASE2_CHECKLIST.md) — checklist Fase 2
- [PHASE1.md](./PHASE1.md) — resumen Fase 1 (cerrada)
- [PHASE1_AUDIT.md](./PHASE1_AUDIT.md) — informe de auditoría Fase 1
- [PHASE1_CHECKLIST.md](./PHASE1_CHECKLIST.md) — checklist Fase 1
- [CHANGELOG_FORK.md](./CHANGELOG_FORK.md) — cambios del fork (búsqueda, cola, Windows)
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — problemas frecuentes
- [cookies/WINDOWS.md](./cookies/WINDOWS.md) — desarrollo y **build release** en Windows
- [cookies/cookies_info.md](./cookies/cookies_info.md) — guía de cookies YouTube para yt-dlp
- [cookies/cookies.txt.example](./cookies/cookies.txt.example) — plantilla Netscape (sin cookies reales)

## Interfaz (resumen reciente)

- **Búsqueda:** batch `ytsearch50` (+ “Cargar 50 más” → hasta 100, dedupe); filas por página medidas **una vez** al mostrar resultados (8–30) y **congeladas** al redimensionar; paginación fija abajo. Nueva búsqueda cancela la anterior.
- **Vista previa:** miniatura + metadatos; tras ~400 ms se enriquece con `get_url_details` (cache en memoria). No es “Embed metadata” del archivo.
- **Cookies:** solo archivo `cookies.txt` en la sidebar (Método A).
- **Cola:** snapshot entre reinicios + banner reanudar; Historial puede abrir el fichero.
- **Formatos:** audio primero, vídeo después; 12 por página con scroll interno y paginación Anterior/Siguiente.
- **Datos clave:** campos traducidos (códec, bitrate, frecuencia, resolución, tamaño) vía `src/lib/format_details.js`.
- **Modos:** Standard / USB BMW / PC; por defecto se elige el mejor audio; USB BMW convierte a M4A y borra el `.webm` fuente.

Detalle técnico en [CHANGELOG_FORK.md](./CHANGELOG_FORK.md) y la tabla *Frontend* de [cookies/WINDOWS.md](./cookies/WINDOWS.md).
