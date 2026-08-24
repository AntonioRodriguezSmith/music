# Pipeline de música (scripts/musica)

Flujo único y centralizado para normalizar, reparar, unificar y organizar la
carpeta de música descargada. Sustituye a los antiguos scripts sueltos
(`normalizar-musica.ps1`, `reparar-tags.ps1`, `unificar-interpretes.ps1`,
`organizar-interpretes.ps1`) que quedaron en `scripts/legacy/`.

## Estructura

```
scripts/musica/
  _lib.ps1              Librería compartida (dot-source): carpetas, ffmpeg,
                        metadatos (ffmetadata UTF-8), mojibake y limpieza.
  01-normalizar.ps1     Nombres de archivo + metadatos básicos + duplicados.
  02-reparar-tags.ps1   Reparación profunda de tags (mojibake, títulos).
  03-unificar.ps1       Unificación de intérpretes + nombres finales (sentence case).
  04-organizar.ps1      Carpetas por intérprete (umbral >3 canciones, carpeta "otros").
  gestion-musica.ps1    Orquestador: ejecuta los pasos en orden (o un subconjunto).
```

## Orden de ejecución

| Paso | Script              | Qué hace                                                                 |
|------|---------------------|--------------------------------------------------------------------------|
| 1    | `01-normalizar.ps1` | Deduplica (por título + artista), limpia nombres (emoji/IDs/"Official Video") y limpia metadatos básicos desde el nombre de archivo. |
| 2    | `02-reparar-tags.ps1` | Reconstruye `title`/`artist`/`album` desde tags y nombre, revirtiendo mojibake. |
| 3    | `03-unificar.ps1`   | Unifica intérpretes (Title Case, alias) y pasa nombres/títulos a *sentence case* sin acentos. |
| 4    | `04-organizar.ps1`  | Crea una carpeta por intérprete (solo si tiene **más de 3 canciones**); el resto va a `otros`. |

Los pasos 1–4 son **idempotentes**: repetirlos no produce cambios adicionales.

## Uso

Todos los pasos (y el orquestador) por defecto son un **ENSAYO**: no modifican
nada y muestran el plan. Usa `-Apply` para aplicar.

Carpeta objetivo: se resuelve en este orden
(`_lib.ps1` → `Resolve-TargetDir`):

1. `-Dir <ruta>`
2. `$env:CLIP_HARBOUR_PLAYER_DIR`
3. `VITE_DEFAULT_DOWNLOAD_PATH` en el `.env` del repo
4. `%USERPROFILE%\Music\MEmu video`

### Flujo completo (recomendado)

```powershell
# Ensayo de todo el pipeline
.\scripts\musica\gestion-musica.ps1 -Dir "C:\Users\nexux\Music\Music"

# Aplicar todo
.\scripts\musica\gestion-musica.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply
```

### Pasos sueltos o subconjuntos

```powershell
# Solo el paso 3 (unificar intérpretes)
.\scripts\musica\gestion-musica.ps1 -Dir "C:\Users\nexux\Music\Music" -Solo 3 -Apply

# Pasos 3 y 4
.\scripts\musica\gestion-musica.ps1 -Dir "C:\Users\nexux\Music\Music" -Desde 3 -Hasta 4 -Apply

# O directamente un paso
.\scripts\musica\03-unificar.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply
```

### Opciones extra del paso 1

```powershell
.\scripts\musica\01-normalizar.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply -DeleteDuplicates -RemoveJunk
```

- `-DeleteDuplicates`: borra los duplicados en lugar de moverlos a `.duplicados`.
- `-RemoveJunk`: borra restos de descargas interrumpidas (`*.part`, `*.ytdl`).

## Reglas e invariantes

- **Fuente principal = nombre de archivo**: los tags de muchas descargas llegan
  corruptos (mojibake); la deduplicación y los títulos se basan en el nombre.
- **Mojibake**: solo se revierte cuando hay caracteres sospechosos y la
  decodificación reduce las "cajas"; los acentos válidos no se tocan.
- **Dos canciones con el mismo título pero artistas distintos NO son duplicadas.**
- **album_artist** se conserva cuando difiere del artist (normalizado sin
  acentos); si es redundante se unifica con el artist.
- Los tags se reescriben con `ffmpeg -c copy` (sin recodificar audio) vía
  ffmetadata UTF-8 sin BOM; los MP3 usan `id3v2_version 3`.
- El paso 3 solo detecta el prefijo `ARTIST - TITULO` para **YUNG BEEF**;
  el resto de nombres se tratan como título.
- El paso 4 crea carpeta propia solo con **>3 canciones**; el resto va a
  `otros`. Las carpetas de intérprete que quedan vacías se eliminan (nunca
  `otros` ni `.duplicados`).
- `.duplicados/`, `__tag_*` y archivos `.temp.*` se excluyen siempre.

## Logs

Cada paso escribe un log en `%TEMP%`:

- `01-normalizar.log`
- `02-reparar-tags.log`
- `03-unificar.log`
- `04-organizar.log`

## Archivos retirados

`scripts/retag-bmw-music.ps1` (renombrado y retag masivo de una colección BMW)
se movió a `scripts/legacy/` por ser específico de una colección concreta y
haberse quedado fuera del flujo. Los 4 scripts antiguos también están ahí como
referencia histórica.
