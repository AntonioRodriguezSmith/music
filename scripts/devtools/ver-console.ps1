# Lee la consola del proceso de la app dev (la salida del cargo run / vite).
# Uso:
#   .\ver-console.ps1            -> muestra las ultimas 50 lineas de la app dev
#   .\ver-console.ps1 -Tail 200  -> muestra las ultimas 200 lineas
#   .\ver-console.ps1 -Watch     -> modo continuo: refresca cada 2s (Ctrl+C para salir)
#   .\ver-console.ps1 -Follow 5  -> sigue el archivo, mostrando las ultimas 5 lineas nuevas (tail -f)

param(
    [int]$Tail = 50,
    [switch]$Watch,
    [int]$Follow = 0
)

$ErrorActionPreference = "Stop"

# La carpeta de terminales de Cursor para ESTE workspace:
# ~/.cursor/projects/<slug>/terminals, donde <slug> = raiz del workspace con
# el ":" de la unidad quitado y "\" -> "-" (p. ej. c-Users-nexux-Proyectos-music).
# El caso exacto del slug varía entre versiones de Cursor; se prueban variantes.
function Get-TerminalsDir {
    $workspaceRoot = Split-Path $PSScriptRoot -Parent
    $base = ($workspaceRoot -replace ':', '') -replace '\\', '-'
    $variants = @(
        $base,                                      # C-Users-nexux-Proyectos-music
        "$([char]::ToLower($base[0]))$($base.Substring(1))", # c-Users-nexux-Proyectos-music
        $base.ToLower()                             # c-users-nexux-proyectos-music
    ) | Select-Object -Unique
    foreach ($v in $variants) {
        $dir = Join-Path $env:USERPROFILE ".cursor\projects\$v\terminals"
        if (Test-Path $dir) { return $dir }
    }
    Join-Path $env:USERPROFILE ".cursor\projects\$($variants[1])\terminals"
}

function Show-Lines([string]$path, [int]$n) {
    if (-not (Test-Path $path)) { Write-Warning "No existe: $path"; return }
    Write-Host "=== $path ===" -ForegroundColor Cyan
    Get-Content $path -Tail $n
    Write-Host ""
}

# La terminal de la app dev es la escrita mas recientemente (vite/cargo emiten
# continuamente). El id de terminal cambia en cada sesion, asi que no se fija uno.
$termDir = Get-TerminalsDir
$devTerm = Get-ChildItem "$termDir\*.txt" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $devTerm) {
    Write-Error "No hay terminales de la app. Lanza antes: npm run dev:windows"
}

if ($Watch) {
    Write-Host "Modo Watch (refresca cada 2s). Ctrl+C para salir."
    while ($true) {
        Clear-Host
        Show-Lines $devTerm.FullName $Tail
        Start-Sleep -Seconds 2
    }
}
elseif ($Follow -gt 0) {
    Write-Host "Siguiendo $($devTerm.Name) (tail -f). Ctrl+C para salir."
    Get-Content $devTerm.FullName -Tail $Follow -Wait
}
else {
    Show-Lines $devTerm.FullName $Tail
}
