<#
.SYNOPSIS
  Carga el PATH de desarrollo (npm, node, cargo, git) para esta terminal.

  Úsalo dot-sourceando para que los cambios sobrevivan a la sesión:
      . .\scripts\env.ps1

  El peso real del trabajo lo hace scripts/setup-windows-env.ps1 (fuente de
  verdad del repo: reconstruye el PATH desde Machine+User y añade cargo/node).
  Este script es un envoltorio corto que Cursor ejecuta al abrir el proyecto
  desde .vscode/settings.json, y que también puedes correr a mano.
#>
. (Join-Path $PSScriptRoot "setup-windows-env.ps1")
