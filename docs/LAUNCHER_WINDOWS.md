# Lanzador Windows (splash + acceso directo)

Arranque “de producto” en desarrollo: icono grande centrado, barra de progreso y **sin ventana de consola**. No sustituye al instalador MSI/NSIS; sirve mientras usas `tauri dev`.

## Uso rápido

1. Doble clic en el acceso directo **Clip Harbour** del Escritorio  
   (o ejecuta `scripts\launch-clip-harbour.vbs`).
2. Aparece el splash (icono CH + textos de estado + barra marquee).
3. Cuando la ventana nativa de Clip Harbour tiene foco, el splash se cierra solo.
4. Si la app ya estaba abierta, el lanzador solo la trae al frente.

Alternativa por terminal:

```powershell
npm run launch:windows   # splash, sin consola (igual que el acceso directo)
npm run dev:windows      # consola visible
npm run tauri -- dev
```

## Archivos

| Ruta | Rol |
|------|-----|
| [`assets/clip-harbour-app-icon.png`](../assets/clip-harbour-app-icon.png) | Icono del splash (PNG) |
| [`assets/clip-harbour-app-icon.ico`](../assets/clip-harbour-app-icon.ico) | Icono del acceso directo / taskbar |
| [`scripts/launch-clip-harbour.vbs`](../scripts/launch-clip-harbour.vbs) | Entrada silenciosa (`wscript`, sin flash de CMD) |
| [`scripts/launch-clip-harbour.ps1`](../scripts/launch-clip-harbour.ps1) | UI splash (WinForms) + arranque oculto de `dev-windows.ps1` |
| [`dev-windows.ps1`](../dev-windows.ps1) | MSVC / `CARGO_TARGET_DIR` + `tauri dev` |

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

1. `wscript` lanza **Windows PowerShell System32** (`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`) en **Hidden** + **STA** — no el stub `WindowsApps\powershell.exe`.
2. El splash muestra etapas aproximadas (tiempo): preparando → cargando → compilando → abriendo → casi listo.
3. En paralelo arranca `dev-windows.ps1` en un proceso **detached** (cerrar el splash no mata `tauri dev`).
4. El splash espera el proceso exacto `clip_harbour` con ventana principal; entonces se cierra.
5. Fail-fast: falta `dev-windows.ps1`, hijo con exit ≠ 0, o exit 0 sin ventana en ~45 s.
6. Log de arranque: `%TEMP%\clip-harbour-launch.log`.

**Nota:** la primera vez (o tras cambios Rust) la compilación puede tardar varios minutos; el splash permanece hasta que abre la UI o hasta timeout (~10 min).

## Relación con el icono de Tauri

- Splash / acceso directo: `assets/clip-harbour-app-*` (fork).
- Icono embebido en builds Tauri: `src-tauri/icons/` (upstream + opcional `clip-harbour-launcher.ico`).

Para un instalador firmado con icono de producto unificado, regenerar `src-tauri/icons` a partir del PNG del fork (fuera del alcance del lanzador dev).

## Problemas frecuentes

Ver [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) → sección *Splash / acceso directo*.
