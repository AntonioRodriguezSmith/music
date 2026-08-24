# MOBILE_SETUP — Toolchain Android, keystore y build (m1-setup)

Fecha: 2026-08-24. Guía operativa para el build Android de Clip Harbour
**sin Android Studio**: toolchain 100% portable descargado a mano. Sustituye a
la instalación gráfica descrita en https://tauri.app/start/prerequisites/#android.

> Contexto: ver `docs/MOBILE_SPIKE.md` (veredicto del spike m0) y `docs/MOBILE.md`
> (arquitectura del port, m8).

## 1. Toolchain portable (Windows, sin Android Studio)

Directorio base: `%USERPROFILE%\toolchain-android`

| Componente | Ruta / comando | Notas |
| --- | --- | --- |
| JDK 17 | `toolchain-android\jdk-17.0.20+8` | Temurin zip: `https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse` |
| Android SDK | `toolchain-android\android-sdk` | `cmdline-tools\latest\bin\sdkmanager.bat` |
| cmdline-tools bin | `cmdline-tools\bin` → junction a `latest\bin` | **El CLI Tauri busca `<sdk>\cmdline-tools\bin\sdkmanager.bat`** |
| Platform | `platforms;android-36` (y `android-35`) | Instalado con sdkmanager |
| Build-Tools | `build-tools;35.0.0` | Instalado con sdkmanager |
| NDK | `ndk;29.0.13846066` | **El que espera el CLI Tauri 2.11** (`NDK_VERSION`) |
| Platform-Tools | `platform-tools` (adb) | Instalado con sdkmanager |
| Targets Rust | `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android` | `rustup target add ...` |

### Comandos de instalación (una vez)

```powershell
$toolchain = "$env:USERPROFILE\toolchain-android"
New-Item -ItemType Directory -Force $toolchain | Out-Null

# 1) JDK 17
curl.exe -L -o "$env:TEMP\jdk17.zip" `
  "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"
Expand-Archive "$env:TEMP\jdk17.zip" $toolchain

# 2) Android SDK cmdline-tools (layout: cmdline-tools/latest)
curl.exe -L -o "$env:TEMP\cmdtools.zip" `
  "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$sdk = "$toolchain\android-sdk"
Expand-Archive "$env:TEMP\cmdtools.zip" "$env:TEMP\cmdtools-x"
Move-Item "$env:TEMP\cmdtools-x\cmdline-tools" "$sdk\cmdline-tools\latest" -Force

# 3) Junction para que Tauri encuentre sdkmanager en cmdline-tools/bin
New-Item -ItemType Junction -Path "$sdk\cmdline-tools\bin" -Target "$sdk\cmdline-tools\latest\bin"

# 4) Paquetes del SDK (aceptar licencias con "y" repetido)
$env:JAVA_HOME = "$toolchain\jdk-17.0.20+8"
$sm = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"
("y`n" * 20) | & $sm --licenses
& $sm --install "platform-tools" "platforms;android-35" "build-tools;35.0.0"
& $sm --install "platforms;android-36" "ndk;29.0.13846066"

# 5) Targets Rust Android
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
```

### Entorno para cada build

```powershell
$toolchain = "$env:USERPROFILE\toolchain-android"
$env:JAVA_HOME = "$toolchain\jdk-17.0.20+8"
$env:ANDROID_HOME = "$toolchain\android-sdk"
$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\29.0.13846066"
$env:NDK_HOME = $env:ANDROID_NDK_HOME
```

## 2. Generar el proyecto Android

```powershell
npm run tauri -- android init
```

- Genera `src-tauri/gen/android/` (app Gradle, MainActivity, buildSrc) y
  `src-tauri/gen/schemas/` (schemas de capabilities, en build).
- **Ruta real:** Tauri 2.11 genera en `src-tauri/gen/android/` (**no** en
  `android/` en la raíz). El proyecto Android es código fuente y se commitea.
- Re-ejecutar `tauri android init` no borra cambios propios de
  `src-tauri/gen/android/` (p. ej. la integración Chaquopy de m2).

## 3. Keystore y firma (sideload)

Distribución **sideload** (APK fuera de Google Play — descargar contenido de
YouTube viola las políticas de Play, igual que el uso personal en Windows sin
Authenticode). No se requiere firma con certificado público para instalar con
"orígenes desconocidos", pero **todo APK debe ir firmado**.

### Generar el keystore (una vez)

```powershell
keytool -genkeypair -v `
  -keystore "$env:USERPROFILE\clip_harbour-android\clip-harbour-release.jks" `
  -alias clip-harbour `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass <PASSWORD> -keypass <PASSWORD> `
  -dname "CN=Clip Harbour, OU=Personal, O=Personal, L=Madrid, ST=Madrid, C=ES"
```

- **Guardar el keystore y la contraseña fuera del repo** (nunca commitear):
  `%USERPROFILE%\clip_harbour-android\` es un buen sitio.
- **No perderlo**: la firma debe ser estable entre versiones (el store de
  Android exige la misma clave para actualizar; aquí se actualiza por
  reinstalación, pero una clave estable evita desinstalar).

### Referenciarlo en el build

Crear `src-tauri/gen/android/keystore.properties` (NO se commitea; ya está en
`src-tauri/gen/android/.gitignore`):

```properties
storeFile=C:\\Users\\nexux\\clip_harbour-android\\clip-harbour-release.jks
storePassword=<PASSWORD>
keyAlias=clip-harbour
keyPassword=<PASSWORD>
```

## 4. Build APK debug / release

```powershell
# Debug (no firmado de release; valida toolchain + proyecto)
npm run tauri -- android build --debug --target aarch64

# Release firmado (usar keystore.properties)
npm run tauri -- android build --target aarch64
```

- `--target aarch64` limita a `aarch64-linux-android` (más rápido). Sin él,
  compila los 3 targets.
- Artefactos: `src-tauri/gen/android/app/build/outputs/apk/...`.
- `--split-per-abi` genera APKs por ABI (recomendado para sideload).

### VITE_ENABLE_PLAYER en móvil

`src/lib/feature_flags.js` activa `/player` solo con `VITE_ENABLE_PLAYER=1`.
La build móvil la fija así:

- `.env.mobile` → `VITE_ENABLE_PLAYER=1` (commiteado; exento del ignore genérico
  de `.env.*` porque no contiene secretos).
- `npm run build:mobile` → `vite build --mode mobile` (carga `.env.mobile`).
- `src-tauri/tauri.android.conf.json` → `build.beforeBuildCommand` =
  `npm run build:mobile` (Tauri 2 mergea la config por plataforma; el desktop
  sigue usando `vite build` normal).

## 5. Capabilities por plataforma

- `src-tauri/capabilities/default.json` → **solo desktop**: se le añadió
  `"platforms": ["windows", "linux", "macOS"]` porque contiene permisos de
  ventana / updater / dialog / opener con rutas Windows que **no existen en
  Android** (romperían el build móvil). Cambio aditivo sin impacto desktop.
- `src-tauri/capabilities/android.json` (schema `mobile`) → capability nueva
  para Android con solo `core:default` + `core:event:default` (el modo Player
  móvil no usa ventanas, diálogos ni updater; los comandos propios de la app
  se permiten vía `invoke_handler`).

## 6. Emular / correr en dispositivo

```powershell
# Con un dispositivo conectado (adb) o un emulador arrancado:
npm run tauri -- android dev
```

- El comando usa el wrapper `tauri-windows.ps1` que pasa `@args` correctamente
  (`npm run tauri -- android dev`).
- Para desarrollo web móvil sin dispositivo: `npm run dev` + devtools
  (viewport móvil) o `npm run build:mobile && npm run preview`.

## Troubleshooting rápido

| Síntoma | Causa / solución |
| --- | --- |
| `failed to ensure Android environment: Skipping Android Studio command line tools installation` | Falta el junction `cmdline-tools\bin` → `latest\bin`, o `ANDROID_HOME` no apunta al SDK |
| `Android NDK not found` | Instalar `ndk;29.0.13846066` y definir `ANDROID_NDK_HOME` |
| `linker link.exe not found` (cargo check) | Cargar el entorno MSVC primero: `. scripts\setup-windows-env.ps1` |
| `resource path binaries\yt-dlp-aarch64-linux-android doesn't exist` | Es **esperado** hasta m2 (proveer el sidecar de ffmpeg / saltar `externalBin` en móvil) |
| `VITE_ENABLE_PLAYER` sin efecto | El build no se lanzó con `--mode mobile`; ver §4 |
