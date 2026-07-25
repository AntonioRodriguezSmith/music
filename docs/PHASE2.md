# Fase 2 — resumen

Producto, fiabilidad, ingeniería y release del fork Windows tras el cierre de Fase 1.

**Estado:** cerrada (código + docs + smoke manual 2026-07-25). Veredicto en [PHASE2_AUDIT.md](./PHASE2_AUDIT.md).

## Qué se entregó

| Hito | Contenido |
|------|-----------|
| **M0** | Setup Método A (`cookies.txt`); UI cookies solo archivo; [PHASE2_SETUP.md](./PHASE2_SETUP.md) |
| **M1** | Persistencia de cola (`queue_snapshot` + banner reanudar); abrir fichero desde Historial |
| **M2** | Retry 403 (≤2, backoff 2s/5s) en descargas si hay cookies; preview enrich debounce 400 ms + cache |
| **M3** | `lib.rs` partido en `models` / `state` / `ytdlp` / `queue`; CI GitHub Actions; Playwright smoke (Vite) |
| **M4** | Opener ACL acotada (Music/Downloads/Documents + D:/E:); CSP `script-src 'self'`; script de firma opcional |
| **M5** | Esta doc + audit/checklist + changelog |

## Cómo usar

En desarrollo usa la **ventana nativa**, no el browser en `:1420`. Arranque: `npm run tauri -- dev` / `npm run dev:windows`, o el acceso directo **Clip Harbour** del Escritorio (splash sin consola) — [LAUNCHER_WINDOWS.md](./LAUNCHER_WINDOWS.md).

1. **Cookies:** [PHASE2_SETUP.md](./PHASE2_SETUP.md) — exportar Netscape → sidebar → Elegir cookies.txt.
2. **Cola:** al reiniciar con pendientes, banner “Reanudar N pendientes” → **Reintentar** (re-download, no resume de bytes).
3. **Historial:** botón Abrir en la fila (ruta absoluta del archivo; ACL Music/Downloads/Documents + D:/E:).
4. **Preview:** al pasar el ratón ~400 ms se pide `get_url_details` una vez por vídeo (cache en memoria).

## Gate local

```powershell
npm test
npm run test:e2e          # tras npm i + npx playwright install
npm run smoke:windows
npm run check:rust        # cargo check con MSVC + log en %TEMP%\clip-harbour-cargo-check.log
# npm run check:rust:bg   # mismo check en ventana minimizada (no abre tauri/splash)
```

`rust-analyzer` ya diagnostica en el IDE; `check:rust` es el gate explícito (CI-like). ~500 crates transitivas de Tauri son normales — la optimización es caché/skip, no podar el árbol.

CI: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (Vitest + Playwright en Ubuntu; en Windows: smoke siempre + `cargo check` solo si cambia `src-tauri/**`, con `Swatinem/rust-cache`).  
Release unsigned: [`.github/workflows/release-windows.yml`](../.github/workflows/release-windows.yml) (`workflow_dispatch`, misma rust-cache). En CI fija `CARGO_TARGET_DIR` a `src-tauri/target` para que los artefactos coincidan con `upload-artifact`. En local los instaladores salen bajo `%LOCALAPPDATA%\clip_harbour-target` (ver [cookies/WINDOWS.md](./cookies/WINDOWS.md)). No hay paquete portable ZIP en Fase 2.

## Firma de instalador

Sin certificado obligatorio. Con thumbprint o PFX:

```powershell
$env:CLIP_HARBOUR_CERT_THUMBPRINT = "..."
npm run sign:windows
```

Ver [scripts/sign-windows.ps1](../scripts/sign-windows.ps1). Alternativa: Azure Trusted Signing / `signtool` manual.

## Auditoría

- [PHASE2_AUDIT.md](./PHASE2_AUDIT.md)
- [PHASE2_CHECKLIST.md](./PHASE2_CHECKLIST.md)
