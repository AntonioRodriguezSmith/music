Clip Harbour — portable Windows x64
Version: 0.1.0
Release: https://github.com/AntonioRodriguezSmith/music/releases/tag/v0.1.0

══════════════════════════════════════
CONTENIDO DEL ZIP
══════════════════════════════════════
  clip_harbour.exe   — aplicacion (Tauri)
  yt-dlp.exe         — descargas
  ffmpeg.exe         — conversion de audio/video
  README.txt         — este archivo

Los tres .exe deben permanecer en la MISMA carpeta.

══════════════════════════════════════
REQUISITOS (PC destino)
══════════════════════════════════════
  - Windows 10/11 de 64 bits
  - Microsoft Edge WebView2 Runtime
    (Windows 11 suele incluirlo; si falta:
     https://developer.microsoft.com/microsoft-edge/webview2/)
  - No hace falta Node, Rust ni instalar MSI/NSIS

══════════════════════════════════════
INSTALACION (portable = sin instalador)
══════════════════════════════════════
  1. Copia clip_harbour-portable-win64.zip al PC.
  2. Descomprime en una carpeta permanente, por ejemplo:
       C:\Apps\ClipHarbour\
       o una carpeta en el Escritorio / USB.
  3. Abre clip_harbour.exe (doble clic).
  4. Si SmartScreen avisa ("Windows protegio tu PC"):
       Mas informacion → Ejecutar de todos modos
       (normal: no hay firma Authenticode en este release).

No aparece en "Agregar o quitar programas".
No hay desinstalador automatico.

══════════════════════════════════════
PRIMER USO
══════════════════════════════════════
  - En la sidebar: elige carpeta de descarga.
  - Cookies YouTube (recomendado): Metodo A — archivo cookies.txt
    (Netscape). Guia: docs/PHASE2_SETUP.md en el repo.
  - Idioma: ES | EN en la sidebar.
  - Busca o pega una URL de YouTube y descarga.

══════════════════════════════════════
DESINSTALAR
══════════════════════════════════════
  1. Cierra Clip Harbour.
  2. Borra la carpeta donde descomprimiste el ZIP.
  (Preferencias/historial locales pueden quedar en AppData;
   borrar la carpeta del ZIP basta para quitar la app.)

══════════════════════════════════════
OTRAS OPCIONES DE DISTRIBUCION
══════════════════════════════════════
  - MSI / NSIS (instalador con desinstalador de Windows):
      clip_harbour_0.1.0_x64_en-US.msi
      clip_harbour_0.1.0_x64-setup.exe
  - Actualizaciones in-app: "Buscar actualizaciones" (requiere
    release en GitHub con latest.json firmado).

══════════════════════════════════════
SOPORTE / CODIGO
══════════════════════════════════════
  Repo:   https://github.com/AntonioRodriguezSmith/music
  Docs:   https://github.com/AntonioRodriguezSmith/music/tree/main/docs
  Setup:  docs/PHASE3_SETUP.md
