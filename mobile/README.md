# mobile — Configuración del dispositivo Android del usuario

Directorio **independiente de la app** `clip_harbour`: contiene solo la
configuración del móvil físico del usuario (datos del dispositivo, ADB
USB/Wi-Fi, WebView DevTools, instalación de la APK de debug y optimización de
batería). No contiene código ni tooling de la aplicación.

Actualizado: 2026-08-25.

## Contenido

| Ruta | Qué es |
| --- | --- |
| `device/README.md` | Datos y configuraciones realizadas en el dispositivo físico (Redmi, ADB, WebView DevTools, batería, build del `.so`). |
| `device/GShell.ps1` | Shell ADB interactivo hacia el móvil (prioriza transporte Wi-Fi; detecta USB). |

## Código de la app (NO se mueve aquí)

La parte móvil de la aplicación vive en `src-tauri/` y se mantiene en su sitio
(el compilador y Tauri exigen esas rutas):

- Proyecto Android generado: `src-tauri/gen/android/`.
- Bridge Rust del motor móvil: `src-tauri/src/ytdlp_android.rs`.
- Puente Kotlin JNI: `src-tauri/gen/android/app/src/main/java/com/clip_harbour/app/YtDlpBridge.kt`.

La toolchain y el proceso de build móvil se explican en `docs/MOBILE_SETUP.md`;
la arquitectura del port móvil en `docs/MOBILE.md` y `docs/MOBILE_SPIKE.md`.

## Salidas de la config móvil

Toda salida generada por la depuración del dispositivo (capturas de pantalla,
logs de ADB, net logs) se guarda **fuera del repo** (p. ej. `%TEMP%`) y no se
commitea. `mobile/` es solo-config, sin artefactos.
