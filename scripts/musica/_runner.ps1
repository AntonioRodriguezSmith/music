#Requires -Version 5.1
<#
.SYNOPSIS
  Lanzador del pipeline de musica invocado desde Rust (musica.rs).

.DESCRIPTION
  Recibe el nombre del script objetivo y sus argumentos, fuerza la salida a
  UTF-8 (para que acentos/emoji de nombres de cancion no lleguen corruptos al
  frontend) e invoca el script. Usar -File con argumentos posicionales evita
  los problemas de quoting de -Command con rutas que contienen espacios.

.PARAMETER Script
  Nombre del script a ejecutar (p.ej. "gestion-musica.ps1" o "01-normalizar.ps1").

.PARAMETER Dir
  Ruta de la carpeta de musica.

.PARAMETER Apply
  Aplica los cambios (modo APLICAR en vez de ENSAYO).

.PARAMETER DeleteDuplicates
  Borra duplicados en vez de moverlos (solo paso 1).

.PARAMETER RemoveJunk
  Borra restos de descargas interrumpidas (solo paso 1).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Script,
  [string]$Dir = '',
  [switch]$Apply,
  [switch]$DeleteDuplicates,
  [switch]$RemoveJunk
)

$ErrorActionPreference = 'Stop'

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$scriptPath = Join-Path $PSScriptRoot $Script
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  Write-Host "SCRIPT_NOT_FOUND: $Script"
  exit 2
}

$scriptArgs = @{ Dir = $Dir }
if ($Apply)            { $scriptArgs['Apply'] = $true }
if ($DeleteDuplicates) { $scriptArgs['DeleteDuplicates'] = $true }
if ($RemoveJunk)       { $scriptArgs['RemoveJunk'] = $true }

try {
  & $scriptPath @scriptArgs
  exit $LASTEXITCODE
} catch {
  Write-Host "RUNNER_ERROR: $($_.Exception.Message)"
  exit 3
}
