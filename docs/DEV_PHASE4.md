# Desarrollo separado — Player (Fase 4)

> **Estado: NO publicado en producción.** Esta fase es un desarrollo que vive **en el código del repo / rama `main`** y **aún no se ha publicado en ninguna release**. En producción (release **v0.1.0**) **solo hay hasta la Fase 3** (vista **Descarga**). Este documento mantiene de forma separada toda la narrativa del modo Player para que no se confunda con el producto publicado.

## Resumen

El fork contempla un **modo Player** (siempre el mismo `.exe`, dos vistas): la vista **Descarga** intacta y una vista **Player** ligera para reproducir y gestionar música. Estado actual: **MVP (Fase 4) en el repo**, integrado en la rama `main`, pendiente de validación y de nueva release.

## Funcionalidades planificadas / en desarrollo

- **Cambio de modo y ruta** — botón en la titlebar y ruta `/player`; la sidebar se vuelve compacta al entrar.
- **Búsqueda en modo Player** — busca sin pasar por la pantalla de descarga; click reproduce o añade a la lista (nunca abre `/val`).
- **Cache de reproducción** — descarga/merge ≤720p en el directorio del player (override `CLIP_HARBOUR_PLAYER_DIR`), LRU purge y prefetch; se reproduce desde el fichero cacheado.
- **Playlists offline** — listas locales (`localStorage`) y en disco bajo `playlists/<slug>/`; crear/renombrar/vaciar/borrar; estados offline/guardando/pendiente.
- **Descargar audio** — CTA que encola `bestaudio` en la cola compartida y lo registra en el historial.
- **Rate-limit de YouTube** — 1 job paralelo, `CLIP_HARBOUR_YT_SLEEP=soft|strict` con gaps de cola y banner de rate-limit.

## Documentación técnica

- Spec / plan: [PHASE4.md](./PHASE4.md)
- Spec detallada (MVP): [phase4/SPEC.md](./phase4/SPEC.md)
- Setup: [PHASE4_SETUP.md](./PHASE4_SETUP.md)
- Playlists / offline: [PLAYER_PLAYLISTS.md](./PLAYER_PLAYLISTS.md)

## Publicación

El modo Player se considerará publicado únicamente cuando salga una **release nueva** que lo incluya. Hasta entonces, quien descargue la release vigente (`v0.1.0`, Fase 3) no tendrá acceso a esta funcionalidad.
