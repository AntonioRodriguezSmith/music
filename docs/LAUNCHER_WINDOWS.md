# Lanzador Windows (splash + acceso directo)

Arranque “de producto”: icono grande centrado, barra de progreso y **sin ventana de consola**.

1. Si existe un build **release** (`%LOCALAPPDATA%\clip_harbour-target\release\clip_harbour.exe`), el acceso directo lanza ese `.exe` **sin Cursor, npm ni Vite**.
2. Si no hay release, cae a `tauri dev` (necesita toolchain; ver abajo).
3. Un proceso **debug** huérfano (ventana abierta pero Vite muerto tras cerrar Cursor) se detecta y se reinicia; no se “enfoca” a ciegas.

## Uso rápido

1. **Una vez:** compila standalone (recomendado para uso diario sin IDE):

```powershell
npm run tauri -- build
```

2. Doble clic en el acceso directo **Clip Harbour** del Escritorio  
   (o ejecuta `scripts\launch-clip-harbour.vbs`).
3. Aparece el splash; cuando la ventana nativa tiene foco, el splash se cierra.
4. Si la app ya estaba abierta **y sana**, el lanzador solo la trae al frente.

Forzar modo desarrollo (ignorar release):

```powershell
$env:CLIP_HARBOUR_FORCE_DEV = "1"
npm run launch:windows
```

Alternativa por terminal:

```powershell
npm run launch:windows   # splash; prefer release si existe
npm run dev:windows      # consola visible (siempre tauri dev)
npm run tauri -- dev
```

## Archivos

| Ruta | Rol |
|------|-----|
| [`assets/clip-harbour-app-icon.png`](../assets/clip-harbour-app-icon.png) | Icono del splash (PNG) |
| [`assets/clip-harbour-app-icon.ico`](../assets/clip-harbour-app-icon.ico) | Icono del acceso directo / taskbar |
| [`scripts/launch-clip-harbour.vbs`](../scripts/launch-clip-harbour.vbs) | Entrada silenciosa (`wscript`, sin flash de CMD) |
| [`scripts/launch-clip-harbour.ps1`](../scripts/launch-clip-harbour.ps1) | UI splash + **release `.exe` si existe**, si no `dev-windows.ps1` |
| [`dev-windows.ps1`](../dev-windows.ps1) | MSVC / `CARGO_TARGET_DIR` + `tauri dev` (fallback) |

El script PowerShell debe guardarse en **UTF-8 con BOM**. Los textos de estado usan `...` ASCII (evitar el carácter `…`) para que Windows PowerShell 5.1 no muestre mojibake.

## Recrear el acceso directo del Escritorio

```powershell
$root = "C:\Users\rodri\Proton Drive\Proyectos\music"   # ajusta si hace falta
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut((Join-Path $desktop "Clip Harbour.lnk"))
$sc.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$sc.Arguments = "//nologo `"$root\scripts\launch-clip-harbour.vbs`""
$sc.WorkingDirectory = $root
$sc.IconLocation = "$root\assets\clip-harbour-app-icon.ico,0"
$sc.Description = "Clip Harbour - splash + ventana nativa (sin consola)"
$sc.Save()
```

## Comportamiento

1. `wscript` lanza **Windows PowerShell System32** en **Hidden** + **STA**.
2. Si hay `clip_harbour.exe` en `%LOCALAPPDATA%\clip_harbour-target\release\`, lo arranca directo (standalone).
3. Si no, arranca `dev-windows.ps1` en proceso detached (cerrar el splash no mata `tauri dev`). Log de npm/cargo: `%TEMP%\clip-harbour-dev.log`.
4. Debug huérfano (sin Vite en `:1420`) se mata y se relanza; release o debug+Vite se enfoca.
5. Fail-fast: hijo con exit ≠ 0, o exit 0 sin ventana (grace más corto en release).
6. Log de arranque: `%TEMP%\clip-harbour-launch.log`.

**Nota:** la primera vez con `tauri dev` (o tras cambios Rust) la compilación puede tardar varios minutos. Con release el splash suele cerrarse en segundos.

## Relación con el icono de Tauri

- Splash / acceso directo: `assets/clip-harbour-app-*` (fork).
- Icono embebido en builds Tauri: `src-tauri/icons/` (upstream + opcional `clip-harbour-launcher.ico`).

Para un instalador firmado con icono de producto unificado, regenerar `src-tauri/icons` a partir del PNG del fork (fuera del alcance del lanzador dev).

## Problemas frecuentes

Ver [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) → sección *Splash / acceso directo*.
