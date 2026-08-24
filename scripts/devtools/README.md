# scripts/devtools

Utilidades para **monitorear y depurar** Clip Harbour en desarrollo (Windows).

## Scripts

| Script | Qué hace |
|---|---|
| `estado.ps1` | Muestra el estado actual: proceso `clip_harbour`, Vite en `:1420`, binario release, toolchain MSVC, sidecars y cookies. |
| `ver-console.ps1` | Imprime la **consola** de la app dev (la salida de `cargo run` / Vite). |
| `ver-devtools.ps1` | Imprime la **consola de DevTools del webview** (`logs\console`, mensajes de `console.*` del frontend). |
| `app-con-log.ps1` | Arranca la app dev y guarda la consola en `logs\*.log`. Si ya corre, copia la consola existente. |
| `capturar-ventana.ps1` | Captura la ventana de la app como PNG en `capturas\`. |

## Uso rápido

```powershell
# Estado general (procesos, puertos, binarios, sidecars)
.\scripts\devtools\estado.ps1

# Ver las ultimas 50 lineas de la consola de la app dev
.\scripts\devtools\ver-console.ps1

# Ver en vivo (refresca cada 2s, Ctrl+C para salir)
.\scripts\devtools\ver-console.ps1 -Watch

# Seguir la consola como tail -f (Ctrl+C para salir)
.\scripts\devtools\ver-console.ps1 -Follow 5

# Arrancar la app y guardar la consola en un archivo de log
.\scripts\devtools\app-con-log.ps1
# Log personalizado
.\scripts\devtools\app-con-log.ps1 -LogName test

# Capturar la ventana de la app
.\scripts\devtools\capturar-ventana.ps1
# A una ruta concreta
.\scripts\devtools\capturar-ventana.ps1 -Out C:\temp\captura.png
```

## Consola de DevTools del webview

En desarrollo, cada mensaje `console.*` del frontend (warnings de React, logs,
errores) se vuelca a `scripts\devtools\logs\console` con prefijo `[level]`. Lo
escribe el comando `devtools_log` del backend, que solo se registra en builds de
debug.

```powershell
# Ver las ultimas 50 lineas de la consola del webview
.\scripts\devtools\ver-devtools.ps1

# Ver en vivo (refresca cada 2s, Ctrl+C para salir)
.\scripts\devtools\ver-devtools.ps1 -Watch

# Seguir como tail -f (Ctrl+C para salir)
.\scripts\devtools\ver-devtools.ps1 -Follow 5
```

## Notas

- Los scripts asumen que la app dev usa el dev server en el **puerto 1420**.
- `ver-console.ps1` y `app-con-log.ps1` derivan la carpeta de terminales del workspace y usan la terminal con actividad más reciente.
- `capturar-ventana.ps1` solo captura la ventana de `clip_harbour`, no toda la pantalla.
- Los logs y capturas quedan en `scripts\devtools\logs\` y `scripts\devtools\capturas\` (ya ignorados en `.gitignore`).
