# Fase 4 — Setup

Requisitos: mismos que [WINDOWS.md](./WINDOWS.md). Probar **solo en ventana Tauri**.

## Cookies

Método A ([PHASE2_SETUP.md](./PHASE2_SETUP.md)). Sin cookies → cache/play puede 403 (mensaje claro en UI post-P5).

## Cache

Path: `%TEMP%\clip_harbour\cache`  
LRU 1 GB; no es `download_path`. Play vía `convertFileSrc` (no opener).

## Smoke manual (validar en P8/P9)

1. Toggle → Player  
2. Buscar vídeo  
3. Reproducir (cache → play)  
4. Next / ítem lista  
5. **Descargar audio** → cola / historial (carpeta usuario)

## Dev

```powershell
npm run dev:windows
```
