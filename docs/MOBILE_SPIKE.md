# Spike de factibilidad móvil (m0-spike)

Fecha: 2026-08-24. Objetivo: eliminar el mayor riesgo del port a Android antes de
comprometer la arquitectura de la Fase 1 (búsqueda, player offline con cache,
playlists, descarga de audio).

Veredicto: **GO condicionado** — el toolchain funciona y el árbol Rust compila
para Android; `ffmpeg` es viable como sidecar arm64. **`yt-dlp` NO tiene binario
standalone para Android**: se pivota a **Chaquopy** (incrustar CPython + yt-dlp
vía JNI) para el motor de extracción, tal como anticipaba el plan (0.7/1.2/1.4).

---

## 1. Toolchain Android (portable, sin Android Studio)

Se instaló un toolchain 100% portable en `%USERPROFILE%\toolchain-android`:

| Componente | Detalle | Estado |
| --- | --- | --- |
| JDK | Temurin 17.0.20 (zip portable, `jdk-17.0.20+8`) | ✅ `java -version` OK |
| Android SDK | `android-sdk` con `cmdline-tools;latest` + junction `cmdline-tools/bin` | ✅ |
| Platform | `platforms;android-35` y `platforms;android-36` | ✅ |
| Build-Tools | `build-tools;35.0.0` | ✅ |
| NDK | `ndk;29.0.13846066` (el que espera el CLI Tauri 2.11) | ✅ |
| Platform-Tools | `platform-tools` (adb) | ✅ |
| Targets Rust | `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android` (+ `i686-linux-android` auto) | ✅ `rustup target list` |

Comandos clave:

```powershell
# JDK portable
curl -L -o %TEMP%\jdk17.zip https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse
Expand-Archive %TEMP%\jdk17.zip %USERPROFILE%\toolchain-android

# Android SDK cmdline-tools
curl -L -o %TEMP%\cmdtools.zip https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
# layout: <sdk>\cmdline-tools\latest\bin\sdkmanager.bat
# el CLI Tauri busca <sdk>\cmdline-tools\bin\sdkmanager.bat -> crear junction cmdline-tools\bin -> latest\bin

# paquetes (aceptar licencias con "y" repetido)
sdkmanager --install "platform-tools" "platforms;android-35" "build-tools;35.0.0"
sdkmanager --install "platforms;android-36" "ndk;29.0.13846066"

# targets Rust
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
```

### `tauri android init` ✅

```powershell
$env:JAVA_HOME = "C:\Users\nexux\toolchain-android\jdk-17.0.20+8"
$env:ANDROID_HOME = "C:\Users\nexux\toolchain-android\android-sdk"
$env:ANDROID_NDK_HOME = "C:\Users\nexux\toolchain-android\android-sdk\ndk\29.0.13846066"
$env:NDK_HOME = $env:ANDROID_NDK_HOME
npm run tauri -- android init
```

Resultado: `victory: Project generated successfully!`.

**Matiz frente al plan (0.7/1.1):** Tauri 2.11 genera el proyecto en
`src-tauri/gen/android/` (con `app/`, `buildSrc/`, `gradle/`), **no** en
`android/` en la raíz del repo como anticipaba el plan. Se documenta en
`docs/MOBILE_SETUP.md` (m1).

### Compilación Rust para Android ✅ (con matiz)

`cargo check --target aarch64-linux-android` **compila todo el árbol** (tauri
2.11, plugins fs/dialog/updater/process/opener/shell, reqwest, ring…) y llega a
`clip_harbour` con el cfg `mobile` activo. El único fallo es esperado:

```
resource path `binaries\yt-dlp-aarch64-linux-android` doesn't exist
```

Es exactamente el trabajo de m2-sidecars (proveer el recurso sidecar / saltar
`externalBin` en móvil). Necesidades de entorno para el check cruzado:

```powershell
$ndk = "C:\Users\nexux\toolchain-android\android-sdk\ndk\29.0.13846066"
$env:CC_aarch64_linux_android = "$ndk\toolchains\llvm\prebuilt\windows-x86_64\bin\aarch64-linux-android21-clang.cmd"
$env:AR_aarch64_linux_android = "$ndk\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-ar.exe"
```

> Nota: `tauri android build` resuelve el CC/AR automáticamente desde
> `ANDROID_NDK_HOME`; el `cargo check` manual requiere las variables de arriba.

## 2. yt-dlp para Android → **NO-GO como sidecar, pivot a Chaquopy**

**Hallazgo:** yt-dlp **no publica un binario standalone para Android**. Los
assets oficiales son solo Windows (x64/arm64), macOS y Linux (glibc/musl, x64 y
aarch64). Un ELF de Linux **no corre en Android** (bionic libc, sin glibc/musl).

Las apps Android reales (YTDLnis ~300k descargas/rel, SaveFrom, Fast-Download,
ElePlay) no usan un binario: **incrustan CPython vía Chaquopy** (plugin Gradle
que empaqueta `libpython3.x.so` y ejecuta yt-dlp **in-process vía JNI**).

- **Librería de referencia (mantenida, 2026-08-22):** `yausername/youtubedl-android`
  (~1350 ⭐) — API Java `YoutubeDL`/`YoutubeDLRequest`, empaqueta yt-dlp vía
  Chaquopy, actualizada a la última release de yt-dlp.
- **Alternativa:** `ffmpegkit-maintained/yt-dlp-android` (API Java limpia,
  Python 3.13 embebido, `YtDlp.init()`; resuelve el error de impersonation).
- **Ejemplo de integración WebView:** `anti-js/Fast-Download-apk` (UI WebView +
  bridge Kotlin + Chaquopy + ffmpeg estático) — mismo patrón que Clip Harbour.

### Consecuencia para la arquitectura (cambia plan 1.2/1.4)

- **Los 6 puntos de spawn de yt-dlp NO pueden usar `app.shell().sidecar()`**
  en Android: no hay binario. En móvil hay dos opciones:
  1. **Chaquopy in-process** (recomendado): el proyecto Android (`src-tauri/gen/android`)
     añade el plugin Chaquopy + `youtubedl-android`, y un comando Rust móvil
     (`#[cfg(mobile)]`) delega en un **bridge JNI** hacia la API Java
     (o un `@JavascriptInterface` en la WebView si se prefiere evitar JNI).
  2. **Motor de descarga en-proceso** (fallback del plan): implementar la
     extracción vía `innertube`/`yt-dlp` REST en Rust (mucho mayor esfuerzo).
- **ffmpeg SÍ se mantiene como sidecar** (sección 3): la conversión
  M4A/MP3 puede seguir siendo subproceso `app.shell().sidecar("ffmpeg")`.
- Los flags de la cola (`pause/resume` por señales) ya estaban previstos como
  desktop-only (1.4); el pivot a Chaquopy refuerza que el spawn de yt-dlp en
  móvil no pasa por `binaries.rs`.

## 3. ffmpeg para Android → **GO como sidecar arm64**

**Hallazgo:** hay builds estáticas arm64-v8a listas para usar:

- **`hzw1199/Android-FFmpeg-Prebuilt`** (verificado): `ffmpeg` y `ffprobe`
  estáticos para **arm64-v8a**, NDK r28, 16 KB pages (requisito Google Play
  para Android 15+), LGPL puro, con aceleración MediaCodec. El asset
  `ffmpeg-8.0.1/bin/ffmpeg` (14.5 MB) se descargó y **se verificó la cabecera**:
  ELF 64-bit little-endian, `e_machine = 0xB7 (AArch64)`. ✅
- **`ffmpegkit-maintained/ffmpeg`**: continuación mantenida de FFmpegKit
  (arm64-v8a, SDK 35, 16 KB), AAR vía Maven
  (`dev.ffmpegkit-maintained:ffmpeg-kit-*:8.1.7`). Útil si se quiere la API de
  librería en vez del ejecutable.
- Conversión M4A/MP3 con `libmp3lame` (LAME): disponible en los builds
  LGPL (ffmpeg-kit-audio / full) y en builds GPL; el binario prebuilt de
  hzw1199 es `--disable-gpl` → **validar `-c:a libmp3lame`** en m2 (si no,
  usar ffmpeg-kit `audio`/`full` que sí incluye LAME).

**Tamaño estimado APK:** ffmpeg sidecar ~15 MB + Chaquopy/yt-dlp ~25-40 MB →
APK arm64 en el rango 60-100 MB (comparable a YTDLnis 64 MB). Aceptable para
sideload (fuera de Play Store).

## 4. Decisión GO/NO-GO

**GO (condicionado) para la Fase 1**, con una corrección de arquitectura sobre
el plan:

| Riesgo | Resultado | Acción |
| --- | --- | --- |
| Toolchain Android en Windows portable | ✅ GO | `tauri android init` + `cargo check` cruzado OK |
| Árbol Rust compila para Android | ✅ GO | Solo falta el recurso sidecar (m2) |
| ffmpeg arm64 | ✅ GO | Binario estático verificado (ELF AArch64) |
| yt-dlp arm64 standalone | ❌ NO-GO | **Pivot a Chaquopy** (CPython + yt-dlp vía JNI) |
| Play Store / sideload | ✅ GO | Distribución sideload (fuera de Play Store) |

**Ajustes al plan derivados del spike:**

1. **m2-sidecars** cambia: sidecar solo para `ffmpeg`. `yt-dlp` se integra vía
   **Chaquopy** en el proyecto Android generado (`src-tauri/gen/android/`), con
   un bridge (JNI o `@JavascriptInterface`) y comandos Tauri móviles
   (`#[cfg(mobile)]`) que sustituyen a los 6 spawn points de yt-dlp en móvil.
   `binaries::ensure()` sigue saltándose en móvil.
2. **1.4/cola:** `pause/resume` sigue siendo desktop-only; en móvil el flujo es
   cancelar + `--download-archive` (sin cambio de plan).
3. **1.6/player offline:** la cache y descarga de audio usan `document_dir`; el
   render del `<video>`/`<audio>` sigue igual.
4. **Docs:** `MOBILE_SETUP.md` debe documentar el toolchain portable, Chaquopy
   en el proyecto Android y la firma con keystore para sideload.

## 5. Pendientes del spike que se cierran en Fase 1

- [ ] Validar `tauri android build --debug` real (m1) — el `cargo check` ya
      compila, pero falta el build Gradle completo.
- [ ] Validar `-c:a libmp3lame` en el binario ffmpeg elegido (m2).
- [ ] Instalar Chaquopy en `src-tauri/gen/android` y probar
      `yt-dlp --version` en dispositivo/emulador (m2).
