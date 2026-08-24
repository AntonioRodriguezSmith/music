# Fase 3 — setup

## Build release + portable

```powershell
npm install
npm run fetch:sidecars:windows
npm run tauri -- build
npm run pack:portable:windows
npm run updater:latest                 # stub latest.json (firmas vacias sin TAURI_SIGNING_*)
npm run install:shortcut:windows       # Clip Harbour.lnk en Escritorio
npm run regen:icons                    # opcional: CH → src-tauri/icons
```

Artefactos tipicos bajo `%LOCALAPPDATA%\clip_harbour-target\release\`:

| Pieza | Ruta |
|-------|------|
| Exe | `clip_harbour.exe` — **autocontenido**: yt-dlp/ffmpeg incrustados y extraídos a `%LOCALAPPDATA%\clip_harbour\bin\` en el primer arranque |
| MSI / NSIS | `bundle\msi\…`, `bundle\nsis\…` |
| Portable ZIP | `bundle\portable\clip_harbour-portable-win64.zip` (incluye `README.txt` desde [PORTABLE_README.txt](./PORTABLE_README.txt)) |
| Updater stub | `bundle\updater\latest.json` |

En CI (`release-windows.yml`) `CARGO_TARGET_DIR` es `src-tauri/target` (no LocalAppData).

## Firma Authenticode (opcional)

**Uso personal:** no hace falta. No hay certificado Authenticode gratuito de confianza; sin PFX el build/CI hace **skip** (exit 0) y la app funciona. SmartScreen puede avisar al abrir un instalador descargado (*Más información* → *Ejecutar de todos modos*). El cert FNMT de email/cliente **no** sirve para code signing.

Aplaza Authenticode hasta que haya un PFX de code signing de pago (OV/EV) y usuarios finales que lo necesiten. Renombrar la app (`productName` / exe / `identifier`) también queda **aplazado**; el nombre visible sigue siendo Clip Harbour.

### Local

```powershell
$env:CLIP_HARBOUR_CERT_THUMBPRINT = "THUMBPRINT"
# o:
# $env:CLIP_HARBOUR_PFX_PATH = "C:\path\cert.pfx"
# $env:CLIP_HARBOUR_PFX_PASSWORD = "..."
npm run sign:windows
```

Sin cert → skip exit 0.

### GitHub Actions (hosted)

No uses una ruta de PFX local como secret (el runner no la tiene). Codifica el `.pfx`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\cert.pfx")) | Set-Clipboard
```

| Secret | Uso |
|--------|-----|
| `CLIP_HARBOUR_PFX_BASE64` | Contenido del `.pfx` en Base64 |
| `CLIP_HARBOUR_PFX_PASSWORD` | Password del PFX (si aplica) |
| `CLIP_HARBOUR_CERT_THUMBPRINT` | Solo si el runner ya tiene el cert en el almacén (p. ej. self-hosted) |

Flujo del workflow:

1. **Prepare** escribe el PFX en `$RUNNER_TEMP` y pone `CLIP_HARBOUR_PFX_PATH` + `CLIP_HARBOUR_SIGNING_CONFIGURED` en `GITHUB_ENV`.
2. **Sign** llama `npm run sign:windows` y borra el PFX temporal.
3. **List** solo imprime el booleano `CLIP_HARBOUR_SIGNING_CONFIGURED` (nunca valores de secrets).

En el YAML, los secrets se inyectan con `fromJSON(toJSON(secrets)).NOMBRE` para evitar el falso positivo del language server del IDE (*Context access might be invalid*). Los nombres de secrets en GitHub Settings no cambian.

Sin secrets el artifact queda unsigned (estado actual del fork).

## Auto-update

1. Genera claves (local, no commits): `npm run tauri -- signer generate -w .tauri/clip-harbour.key` (carpeta `.tauri/` en `.gitignore`).
2. Pubkey en `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` (ya hay una generada en el fork; regenera si rotas claves).
3. CI / release: secret `TAURI_SIGNING_PRIVATE_KEY` (+ password si aplica) para firmar el instalador / `latest.json`.
4. Publica en GitHub Releases: NSIS (o MSI) + `latest.json` firmado en  
   `https://github.com/AntonioRodriguezSmith/music/releases/latest/download/…`
5. Endpoint configurado: ese `latest.json`.

### Estado publicado (2026-07-28)

- Release del fork: [v0.1.0](https://github.com/AntonioRodriguezSmith/music/releases/tag/v0.1.0) — MSI, NSIS, portable ZIP, `clip_harbour.exe`, `.sig`, `latest.json`.
- `TAURI_SIGNING_PRIVATE_KEY` configurado en el repo; Authenticode **no** (sin `CLIP_HARBOUR_PFX_*`).
- Workflow: [`.github/workflows/release-windows.yml`](../.github/workflows/release-windows.yml) (`workflow_dispatch`).

Sin Release firmado, **Buscar actualizaciones** muestra un error claro; la app sigue usable.

## Cookies / carpeta

Igual que Fase 2: [PHASE2_SETUP.md](./PHASE2_SETUP.md).
