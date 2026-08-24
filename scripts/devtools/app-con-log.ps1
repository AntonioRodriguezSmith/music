# Ejecuta la app dev y guarda la consola en un archivo de log dentro de scripts\devtools\logs.
# La consola se sigue mostrando en pantalla a la vez que se escribe al archivo.
#
# Uso:
#   .\app-con-log.ps1               -> arranca dev-windows.ps1 y guarda la salida en logs\
#   .\app-con-log.ps1 -LogName test -> guarda en logs\test-YYYYMMDD-HHmmss.log
#
# Nota: NO arranca la app de nuevo si ya hay una instancia dev corriendo (puerto 1420).

param(
    [string]$LogName = "app-dev"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Carpeta de terminales de Cursor para este workspace (misma logica que ver-console.ps1).
function Get-TerminalsDir {
    $base = ($root -replace ':', '') -replace '\\', '-'
    $variants = @(
        $base,
        "$([char]::ToLower($base[0]))$($base.Substring(1))",
        $base.ToLower()
    ) | Select-Object -Unique
    foreach ($v in $variants) {
        $dir = Join-Path $env:USERPROFILE ".cursor\projects\$v\terminals"
        if (Test-Path $dir) { return $dir }
    }
    Join-Path $env:USERPROFILE ".cursor\projects\$($variants[1])\terminals"
}

# Si el puerto 1420 ya esta ocupado, la app dev ya corre: solo avisa.
$conn = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "El puerto 1420 ya esta en uso (app dev en marcha). El log se captura de la terminal existente." -ForegroundColor Yellow
    $devTerm = Get-ChildItem "$(Get-TerminalsDir)\*.txt" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($devTerm) {
        $out = Join-Path $PSScriptRoot "logs\$LogName-$(Get-Date -Format yyyyMMdd-HHmmss).log"
        Get-Content $devTerm.FullName | Set-Content $out
        Write-Host "Consola copiada a: $out"
    }
    exit 0
}

$stamp = Get-Date -Format yyyyMMdd-HHmmss
$logFile = Join-Path $PSScriptRoot "logs\$LogName-$stamp.log"
Write-Host "Log en: $logFile"

# Lanza el launcher con la salida teed al archivo
powershell -ExecutionPolicy Bypass -File ".\dev-windows.ps1" 2>&1 | Tee-Object -FilePath $logFile
