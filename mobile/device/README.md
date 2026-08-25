# device — Configuración y datos del dispositivo Android (móvil)

Donde guardar la configuración concreta del teléfono físico usado para el build /
Depuración en Android. Todo el contexto de toolchain/build (no dependiente del
dispositivo) vive en `docs/MOBILE_SETUP.md`; aquí van los **datos del móvil** y
cómo conectarse a él por ADB (USB + Wi-Fi) y a su WebView DevTools.

> **Última captura de datos verificada:** 2026-08-25 (transporte USB; incluye estado VPN).
> Actualizado: 2026-08-25.

## 1. Dispositivo (Redmi Note 14 Pro 5G)

| Dato | Valor |
| --- | --- |
| Marca | `Xiaomi` (`ro.product.manufacturer`) |
| Marca de producto | `Redmi` (`ro.product.brand`) |
| Código de modelo (build) | `24090RA29G` (`ro.product.model`) |
| SoC | MediaTek Dimensity 7300 Ultra (`mt6878`) — ARM64 |
| `ro.hardware` | `mt6878` |
| ABI | `arm64-v8a` (`ro.product.cpu.abi`) |
| RAM | ~7,6 GB (`MemTotal 7.607.064 kB`) |
| Almacenamiento interno | `/data` 227 GB (68 GB usados / 159 GB libres ~30%) |
| Sistema | HyperOS `OS3.0.3.0.WOOEUXM` (Android 16, SDK 36) |
| Parche de seguridad | 2026-02-01 |
| Fingerprint | `Xiaomi/missi/missi:16/BP2A.250605.031.A3/OS3.0.3.0.WOOEUXM:user/release-keys` |
| ABI objetivo (build) | `arm64-v8a` / `aarch64-linux-android` (API 21+) |
| Otras ABIs de ffmpeg | solo `arm64-v8a` (ver `docs/MOBILE.md`) |
| VPN | **Proton VPN Pro** (`ch.protonvpn.android`) **activa** — interfaz `tun0`, IP `10.2.0.2/32` (IPv6 `2a07:b944::2:2/128`); datos móviles `ccmni1` UP (`6.13.234.43/8`) |

### Red Wi-Fi (conectada en captura)

| Dato | Valor |
| --- | --- |
| SSID | `DIGIFIBRA-PLUS-VEm4` (red ID 8, `Currently Connected: true`) |
| BSSID | `78:20:51:0e:42:ca` |
| MAC wlan0 | `d6:b1:29:f9:83:f8` |
| IP (DHCP) | `192.168.1.132` |
| Estándar / banda | Wi-Fi 6 (`11ax`) / 5 GHz (5200 MHz) |

> Nota: la IP Wi-Fi del móvil **cambia** (DHCP). En 2026-08-24 era `192.168.1.131`
> y en la captura de 2026-08-25 `192.168.1.132`. Leerla siempre con
> `ip -4 addr show wlan0` antes de emparejar/ADB Wi-Fi.

### Provider WebView y app instalada

| Dato | Valor |
| --- | --- |
| Provider WebView | `com.google.android.webview` **151.0.7922.83** (stable, targetSdk 36) |
| App `com.clip_harbour.app` | versionName `0.1.0`, versionCode `1000`, minSdk 24, targetSdk 36 |

Para refrescar los datos reales desde ADB:

```powershell
adb shell getprop ro.product.model
adb shell getprop ro.board.platform
adb shell getprop ro.product.cpu.abi
adb shell ip -4 addr show wlan0           # IP Wi-Fi actual
adb shell ip addr show tun0               # VPN activa (Proton -> 10.2.0.2)
adb shell pm list packages | grep proton  # paquetes Proton instalados
adb shell dumpsys webviewupdate | head    # provider WebView
adb shell dumpsys package com.clip_harbour.app | findstr /i /c:versionName= /c:versionCode=
```

## 2. ADB — adb portátil usado (sin Android Studio)

Los comandos `adb` se llaman con la toolchain portable (no está en PATH system):

```powershell
$adb = "C:\Users\nexux\toolchain-android\android-sdk\platform-tools\adb.exe"
& $adb devices -l
```

Alias cómodo para abrir `adb shell` interactivo (prioriza Wi-Fi/TLS):

```powershell
.\mobile\device\GShell.ps1          # shell interactivo
.\mobile\device\GShell.ps1 -Cmd "id"   # comando puntual
```

## 3. Estado de conexión del dispositivo

Ver los transportes (USB y Wi-Fi mDNS a la vez):

```powershell
& $adb devices -l

# Ejemplo de salida en este repo:
# NVJBCQG6W85X4LFQ  device product:malachite_eea model:24090RA29G transport_id:1   <- USB
# adb-NVJBCQG6W85X4LFQ-..._adb-tls-connect._tcp device ... transport_id:2            <- Wi-Fi
```

- `transport_id:1` → USB.
- `transport_id:2` → Wi-Fi (ADB inalámbrico, TLS). Usar `-t 2` en los comandos
  (p. ej. `& $adb -t 2 shell ...`) para apuntar al transporte Wi-Fi; `-s
  NVJBCQG6W85X4LFQ` apunta al USB.

## 4. ADB inalámbrico (emparejar y conectar)

En el teléfono: **Ajustes → Configuración adicional → Opciones de desarrollador →
Depuración inalámbrica** (verificada en HyperOS 3.0.3.0). Opciones:

- **Vincular dispositivo con código de vinculación** → muestra `IP:PORT` + código
  de 6 dígitos (el puerto cambia en cada emparejamiento).
- Mismo nombre de red Wi-Fi que el PC.

Datos usados en este equipo:

| Aspecto | Valor |
| --- | --- |
| IP Wi-Fi del móvil | `192.168.1.132` (cambia por DHCP; ver sección 1) |
| Puertos | cambian en cada `pair`/`connect`; leerlos de la pantalla del teléfono |

```powershell
# 1) Emparejar (código de un solo uso; usar la IP real del móvil, NO 10.0.2.x)
& $adb pair 192.168.1.132:<PUERTO_PAIR>   # pedirá el código de 6 dígitos
#   O pasándole el código directamente:
& $adb pair 192.168.1.132:<PUERTO_PAIR> 073145

# 2) Conectar (puerto de la pantalla principal de "Depuración inalámbrica",
#    distinto al de pair; a veces adb ya conecta vía mDNS sin connect explícito)
& $adb connect 192.168.1.132:<PUERTO_CONNECT>
& $adb devices -l   # debe aparecer el transporte _adb-tls-connect._tcp en state "device"
```

> Notas aprendidas en `m0/mobile`:
> - El `10.2.0.2:PORT` que a veces muestra la pantalla **no es la IP del móvil
>   físico**: es la IP del túnel **Proton VPN** (`tun0`, `10.2.0.2/32`) cuando la
>   VPN está activa. Emparejar contra `10.2.0.2` da `protocol fault` (verificado).
>   Usar siempre la IP LAN real del Wi-Fi (`ip -4 addr show wlan0`); si falla,
>   **pausar la VPN** durante el emparejamiento/conexión ADB inalámbrica.
> - El puerto de **pair** y el de **connect** son distintos y rotan; leerlos del
>   teléfono en cada sesión.
> - Emparejar **cada vez que se reinicia** la depuración inalámbrica o el móvil.

## 5. WebView DevTools (chrome://inspect / ws://localhost:9222)

Para poder inspeccionar el WebView de Tauri en el móvil:

1. La app debe estar construida con `WebView.setWebContentsDebuggingEnabled(true)`
   (activo en `MainActivity.onCreate`).
2. Reenviar el socket de DevTools del proceso de la app al host:

```powershell
# Obtener el pid actual de la app (cambia en cada launch)
$pid_ = (& $adb -t 2 shell pidof com.clip_harbour.app) -replace "\s",""

# Reenviar tcp:9222 local del PC -> socket DevTools del WebView en el móvil
& $adb -t 2 forward tcp:9222 localabstract:webview_devtools_remote_$pid_
& $adb -t 2 forward --list    # verificar el forward activo
```

3. Comprobar que el target se lista y abrir en el navegador del PC:

```powershell
curl.exe -s http://localhost:9222/json
#   -> "type":"page", "url":"http://tauri.localhost/", "webSocketDebuggerUrl":
#      "ws://localhost:9222/devtools/page/<ID>"
```

Abrir en Chrome/Edge: `chrome://inspect` → dispositivo `24090RA29G` → "inspect".
(O pegar directo el `devtoolsFrontendUrl` que devuelve `/json`.)

Ejemplo real de target (2026-08-24):

```
id: F53ED5E7404EFDEF46FB32600228A868
url: http://tauri.localhost/
ws:  ws://localhost:9222/devtools/page/F53ED5E7404EFDEF46FB32600228A868
```

Para **detener** el forward: `adb -t 2 forward --remove tcp:9222`.

## 6. Optimización de batería / que no se ponga en Doze

Si la app se duerme o pierde la conexión al hacer tareas largas:

```powershell
# Estado de restricción en segundo plano
& $adb -t 2 shell appops get com.clip_harbour.app RUN_IN_BACKGROUND

# Comprobar si está en la whitelist de Doze (parámetro opcional)
& $adb -t 2 shell dumpsys deviceidle whitelist | findstr clip_harbour
```

En el teléfono (HyperOS): **Ajustes → Aplicaciones → Clip Harbour →
Batería / Ahorro de batería** → **Sin restricción** (a menudo hay que entrar por
"Otras opciones de ahorro de batería" o desde Configuración adicional del
desarrollador). En 2026-08-24 se quitó la restricción manualmente. Hay que
**recomprobar** tras reinstalar/actualizar la app (los "no limitar" se resetean).

## 7. Instalar / actualizar la APK en el dispositivo

```powershell
& $adb -t 2 install -r "src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk"
& $adb -t 2 shell am start -n com.clip_harbour.app/.MainActivity
```

Ver la salida del backend / panics Rust:

```powershell
& $adb -t 2 logcat -T 1 -v brief | findstr /i "RustStdoutStderr panicked clip_harbour.app AndroidRuntime"
```

## 8. Resolución de fallos del build del `.so` (carpeta móvil)

El task Gradle `:app:rustBuildArm64Debug` invoca `tauri android android-studio-script`,
que requiere el dev server (falla con `failed to read missing addr file ...server-addr`).
Para compilar el `.so` a mano y empaquetar sin dev server:

```powershell
# 1) Compilar el .so con el linker del NDK (necesario; "cc not found" si falta)
$ndkbin = "$env:USERPROFILE\toolchain-android\android-sdk\ndk\29.0.13846066\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkbin\aarch64-linux-android21-clang.cmd"
$env:AR_aarch64_linux_android                 = "$ndkbin\llvm-ar.exe"

# 2) Copiar el .so nuevo a jniLibs y ensamblar el APK (smoke, sin rustBuild)
Copy-Item -Force "C:\Users\nexux\AppData\Local\clip_harbour-target\aarch64-linux-android\debug\libclip_harbour_lib.so" `
  "src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a\libclip_harbour_lib.so"
.\gradlew.bat :app:assembleArm64Debug -x :app:rustBuildArm64Debug -x :app:rustBuildUniversalDebug
```

El fix de crash del `handleRequest` (panic de rustls en Android) se documenta en
`docs/MOBILE_SPIKE.md` §6; en resumen: instalar el provider
`rustls::crypto::ring::default_provider()` en `lib.rs::run()` bajo
`cfg(target_os = "android")` y depender de `rustls` con feature `ring`.
