# Imprime la consola de DevTools del webview (el archivo scripts\devtools\logs\console).
# Ese archivo lo escribe el backend (comando devtools_log) cuando el frontend
# emite mensajes por console.* en dev.
# Uso:
#   .\ver-devtools.ps1           -> muestra las ultimas 50 lineas
#   .\ver-devtools.ps1 -Tail 200 -> muestra las ultimas 200 lineas
#   .\ver-devtools.ps1 -Watch    -> refresca cada 2s (Ctrl+C para salir)
#   .\ver-devtools.ps1 -Follow 5 -> tail -f (Ctrl+C para salir)

param(
    [int]$Tail = 50,
    [switch]$Watch,
    [int]$Follow = 0
)

$ErrorActionPreference = "Stop"

$log = Join-Path $PSScriptRoot "logs\console"
if (-not (Test-Path $log)) {
    Write-Error "No existe: $log. Lanza la app dev (npm run dev:windows) y espera a que el webview emita mensajes."
}

function Show-Lines {
    Write-Host "=== $log ===" -ForegroundColor Cyan
    Get-Content $log -Tail $Tail
    Write-Host ""
}

if ($Watch) {
    Write-Host "Modo Watch (refresca cada 2s). Ctrl+C para salir."
    while ($true) {
        Clear-Host
        Show-Lines
        Start-Sleep -Seconds 2
    }
}
elseif ($Follow -gt 0) {
    Write-Host "Siguiendo $log (tail -f). Ctrl+C para salir."
    Get-Content $log -Tail $Follow -Wait
}
else {
    Show-Lines
}
