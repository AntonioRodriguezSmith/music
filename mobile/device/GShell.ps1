# Abre un `adb shell` interactivo al dispositivo Android (móvil).
# Prioriza el transporte Wi-Fi (adb-tls) cuando existe; si no, usa el USB único.
#
# Uso:
#   .\GShell.ps1            -> abre shell interactivo
#   .\GShell.ps1 -Cmd "ls"  -> ejecuta un comando y devuelve la salida
#
# La ruta de adb se deriva de la toolchain portable (ver docs/MOBILE_SETUP.md).

param(
    [string]$Cmd = ""
)

$ErrorActionPreference = "Stop"

$adb = "C:\Users\nexux\toolchain-android\android-sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
    Write-Error "adb.exe no encontrado en $adb. Revisa la toolchain Android."
}

# Lista dispositivos y selecciona el transporte.
$out = & $adb devices -l
$transports = $out | Select-String -Pattern 'adb-(\S+)\._adb-tls-connect\._tcp[^:]*\ttransport_id:(\d+)|transport_id:(\d+)' -AllMatches

# Buscar el transporte Wi-Fi (mDNS adb-tls-connect).
$wifiTransport = $out | Select-String -Pattern 'adb-\S+\._adb-tls-connect\._tcp.*transport_id:(\d+)'
$usbTransport  = $out | Select-String -Pattern '^(\S+)\s+device\s+product:.*transport_id:(\d+)$' | ForEach-Object { $_.Matches[0].Groups[2].Value }

$chosen = $null
if ($wifiTransport) {
    $chosen = $wifiTransport.Matches[0].Groups[1].Value
    Write-Host "GShell -> transporte Wi-Fi (transport_id=$chosen)" -ForegroundColor Cyan
} elseif ($usbTransport) {
    $chosen = ($usbTransport | Select-Object -Last 1)
    Write-Host "GShell -> transporte USB (transport_id=$chosen)" -ForegroundColor Cyan
} else {
    Write-Error "Ningun dispositivo Android conectado. Revisa el cable USB o vincula por Wi-Fi (Depuracion inalambrica)."
}

if ($Cmd) {
    & $adb -t $chosen shell $Cmd
    exit $LASTEXITCODE
}

# Shell interactivo: escribe "exit" para salir.
& $adb -t $chosen shell
