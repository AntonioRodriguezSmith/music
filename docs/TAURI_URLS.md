# Tauri — URLs de referencia (Clip Harbour)

Este fork usa **Tauri 2**. Las URLs de Tauri **1** se listan solo como archivo histórico / comparación.

**Canónico para esta app:** [https://v2.tauri.app/](https://v2.tauri.app/)  
**No usar Tauri 1** para APIs nuevas: [https://v1.tauri.app/](https://v1.tauri.app/) (docs marcadas como *old version*).

Relacionado: [WINDOWS.md](./WINDOWS.md) · [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) · [PHASE4_SETUP.md](./PHASE4_SETUP.md)

---

## Tauri 1 — Quick Start (página revisada)

Fuente: [Quick Start (v1)](https://v1.tauri.app/v1/guides/getting-started/setup)

| Recurso | URL |
|---------|-----|
| Quick Start (hub) | https://v1.tauri.app/v1/guides/getting-started/setup |
| Docs actuales (aviso v1 → latest) | https://tauri.app/ |
| Prerrequisitos v1 | https://v1.tauri.app/v1/guides/getting-started/prerequisites |
| HTML / CSS / JS | https://v1.tauri.app/v1/guides/getting-started/setup/html-css-js |
| Next.js | https://v1.tauri.app/v1/guides/getting-started/setup/next-js |
| Qwik | https://v1.tauri.app/v1/guides/getting-started/setup/qwik |
| SvelteKit | https://v1.tauri.app/v1/guides/getting-started/setup/sveltekit |
| Vite (stack cercano a este repo) | https://v1.tauri.app/v1/guides/getting-started/setup/vite |
| Integrar en proyecto existente | https://v1.tauri.app/v1/guides/getting-started/setup/integrate |

### Scaffold `create-tauri-app` (comandos de la página v1)

| Medio | URL / comando |
|-------|----------------|
| Script Bash | https://create.tauri.app/sh (`--tauri-version 1`) |
| Script PowerShell | https://create.tauri.app/ps (`CTA_ARGS=--tauri-version 1`) |

### Enlaces citados desde la guía Vite v1

| Recurso | URL |
|---------|-----|
| Cargo — Manifest Format | https://doc.rust-lang.org/cargo/reference/manifest.html |
| Cargo (docs generales) | https://doc.rust-lang.org/cargo/ |
| Contribución Tauri (guías nuevas) | https://github.com/tauri-apps/tauri-docs |

---

## Tauri 2 — canónico (usar esto)

### Inicio / stack

| Recurso | URL |
|---------|-----|
| Hub docs v2 | https://v2.tauri.app/ |
| ¿Qué es Tauri? (ES) | https://v2.tauri.app/es/start/ |
| Prerrequisitos | https://v2.tauri.app/start/prerequisites/ |
| Prerrequisitos (ES) | https://v2.tauri.app/es/start/prerequisites/ |
| Create a Project | https://v2.tauri.app/start/create-project/ |
| Project Structure | https://v2.tauri.app/start/project-structure/ |
| Frontend — Vite | https://v2.tauri.app/start/frontend/vite/ |
| Frontend config hub | https://v2.tauri.app/start/frontend/ |
| Features & recipes | https://v2.tauri.app/plugin/ |
| create-tauri-app (v2, sin `--tauri-version 1`) | https://create.tauri.app/sh · https://create.tauri.app/ps |

### Seguridad / play local (Player)

| Recurso | URL | Uso en Clip Harbour |
|---------|-----|---------------------|
| Asset protocol scope | https://v2.tauri.app/es/security/asset-protocol/ | Scope `Music/**/.cache` · `requireLiteralLeadingDot` |
| Asset protocol (EN) | https://v2.tauri.app/security/asset-protocol/ | Idem |
| CSP | https://v2.tauri.app/es/security/csp/ | `media-src` + `asset:` / `http://asset.localhost` |
| CSP (EN) | https://v2.tauri.app/security/csp/ | Idem |
| Capabilities | https://v2.tauri.app/security/capabilities/ | `capabilities/default.json` |
| Command scopes | https://v2.tauri.app/security/scope/ | ACL / permisos |
| `convertFileSrc` | https://v2.tauri.app/es/reference/javascript/api/namespacecore/#convertfilesrc | `<video src={convertFileSrc(path)}>` |
| Calling Rust from FE | https://v2.tauri.app/develop/calling-rust/ | `invoke` |
| Persisted Scope plugin | https://v2.tauri.app/es/plugin/persisted-scope/ | Carpetas elegidas en runtime |

### Windows / distribución

| Recurso | URL |
|---------|-----|
| Windows Installer | https://v2.tauri.app/distribute/windows-installer/ |
| Sign Windows | https://v2.tauri.app/distribute/sign/windows/ |
| Updater plugin | https://v2.tauri.app/plugin/updater/ |
| Embedding external binaries (sidecars) | https://v2.tauri.app/develop/resources/ |
| Configuration | https://v2.tauri.app/develop/configuration-files/ |

### Comunidad / org

| Recurso | URL |
|---------|-----|
| GitHub Tauri | https://github.com/tauri-apps/tauri |
| Blog Tauri 1.0 (filosofía, enlazado desde v2 start) | https://v2.tauri.app/blog/tauri-1-0/ (o entrada equivalente en blog) |
| Security policy | https://github.com/tauri-apps/tauri/security/policy |
| Auditoría Tauri 2.0 | https://v2.tauri.app/security/ (ver enlace “audit report” en start) |

---

## Resumen para este repo

| Necesidad | Ir a |
|-----------|------|
| Setup / Vite / Windows | v2 start + [WINDOWS.md](./WINDOWS.md) |
| Vídeo negro / `asset:` / `.cache` | [asset-protocol](https://v2.tauri.app/es/security/asset-protocol/) · [PHASE4_SETUP](./PHASE4_SETUP.md) |
| Comparar con docs viejas | [v1 Quick Start](https://v1.tauri.app/v1/guides/getting-started/setup) (no copiar APIs a código) |
