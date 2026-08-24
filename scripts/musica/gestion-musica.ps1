#Requires -Version 5.1
<#
.SYNOPSIS
  Orquestador del pipeline de musica: ejecuta los pasos 01-04 en orden.

.DESCRIPTION
  Ejecuta los 4 pasos (01-normalizar, 02-reparar-tags, 03-unificar,
  04-organizar) en secuencia. Cada paso funciona en modo ENSAYO por defecto;
  pasa -Apply al orquestador para aplicar los 4 pasos de una vez.

  Opciones de seleccion de pasos:
    -Desde <n>  inicia en el paso n (1..4)
    -Hasta <n>  termina en el paso n (1..4)
    -Solo <n>   ejecuta solo el paso n (equivale a -Desde n -Hasta n)

  Si un paso falla (excepcion no capturada), el flujo se detiene.

.PARAMETER Dir
  Ruta de la carpeta de musica (se resuelve desde _lib.ps1 si se omite).

.PARAMETER Apply
  Pasa -Apply a todos los pasos (aplica los cambios).

.PARAMETER Desde
  Primer paso a ejecutar (por defecto 1).

.PARAMETER Hasta
  Ultimo paso a ejecutar (por defecto 4).

.PARAMETER Solo
  Ejecuta un unico paso.

.EXAMPLE
  .\gestion-musica.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\gestion-musica.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply

.EXAMPLE
  .\gestion-musica.ps1 -Dir "C:\Users\nexux\Music\Music" -Solo 3
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply,
  [int]$Desde = 1,
  [int]$Hasta = 4,
  [int]$Solo = 0
)

$ErrorActionPreference = 'Stop'

if ($Solo -gt 0) { $Desde = $Solo; $Hasta = $Solo }
if ($Desde -lt 1) { $Desde = 1 }
if ($Hasta -gt 4) { $Hasta = 4 }

$steps = @(
  @{ N = 1; Script = '01-normalizar.ps1';   Nombre = 'Normalizar nombres / tags basicos / duplicados' }
  @{ N = 2; Script = '02-reparar-tags.ps1'; Nombre = 'Reparar tags (mojibake)' }
  @{ N = 3; Script = '03-unificar.ps1';     Nombre = 'Unificar interpretes + nombres finales' }
  @{ N = 4; Script = '04-organizar.ps1';    Nombre = 'Organizar carpetas por interprete' }
)

$mode = if ($Apply) { 'APLICAR' } else { 'ENSAYO' }
Write-Host "== Pipeline de musica ($mode) ==" -ForegroundColor Cyan
Write-Host "Pasos: $Desde..$Hasta  (Dir: $Dir)"
Write-Host ''

$failed = @()
foreach ($s in $steps) {
  if ($s.N -lt $Desde -or $s.N -gt $Hasta) { continue }
  Write-Host ("== PASO {0}/4: {1} ==" -f $s.N, $s.Nombre) -ForegroundColor Cyan
  $scriptPath = Join-Path $PSScriptRoot $s.Script
  $stepArgs = @{ Dir = $Dir }
  if ($Apply) { $stepArgs['Apply'] = $true }
  try {
    & $scriptPath @stepArgs
  } catch {
    $failed += "$($s.N): $($s.Nombre) [$($_.Exception.Message)]"
    Write-Host ("PASO {0} FALLO: {1}" -f $s.N, $_.Exception.Message) -ForegroundColor Red
    break
  }
  Write-Host ''
}

Write-Host '========================================' -ForegroundColor Cyan
if ($failed.Count -gt 0) {
  Write-Host ("FLUJO INTERRUMPIDO en: {0}" -f ($failed -join ' | ')) -ForegroundColor Red
  exit 1
}
Write-Host 'FLUJO COMPLETADO.' -ForegroundColor Green
exit 0
