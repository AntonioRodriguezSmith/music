#Requires -Version 5.1
<#
.SYNOPSIS
  PASO 2 del pipeline: repara los metadatos (tags) de los archivos de audio.

.DESCRIPTION
  Estrategia (elegida por el usuario):
    - TITULO  = nombre de archivo (ya normalizado/limpio). Si el nombre tiene
                residuos irrecuperables (emoji corrupto), se usa el tag title.
    - ARTISTA = tag artist actual decodificado de mojibake; si no hay, se
                deriva del patron "Artista - Titulo" del nombre de archivo.
    - ALBUM   = tag album actual decodificado de mojibake.
    - ALBUM_ARTIST: si el original existe y difiere del artist (en forma
                normalizada sin acentos), se conserva; si es redundante, se
                unifica con el artist.

  La decodificacion de mojibake revierte los acentos corruptos (tipo "Ojal├í",
  "maÃ±ana") que dejaron los tags de muchas descargas. Solo actua cuando el
  texto contiene caracteres sospechosos (controles, ├─ cajas, Ã, ±, etc.) y la
  decodificacion los elimina; los acentos validos NO se tocan.

  Por defecto es un ENSAYO (no escribe nada). Usa -Apply para aplicar.
  Los tags se reescriben con ffmpeg sin recodificar el audio (-c copy).

.PARAMETER Dir
  Ruta de la carpeta de musica a reparar (se resuelve desde _lib.ps1 si se omite).

.PARAMETER Apply
  Aplica los cambios (escribe los tags).

.EXAMPLE
  .\02-reparar-tags.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\02-reparar-tags.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_lib.ps1')
$logPath = Join-Path $env:TEMP '02-reparar-tags.log'
$report = New-Object System.Collections.Generic.List[string]

$dir = Resolve-TargetDir -Explicit $Dir
if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
  throw "Carpeta no encontrada: $dir"
}
$dir = (Get-Item -LiteralPath $dir).FullName
Write-Host "Carpeta objetivo: $dir"

$ff = $script:Ff
if (-not $ff) { throw "ffmpeg no encontrado" }
Write-Host "ffmpeg: $ff"

$files = Get-MusicFiles $dir

$plan = New-Object System.Collections.Generic.List[object]
foreach ($f in $files) {
  $meta = Get-AudioMeta -path $f.FullName
  $title = ConvertTo-CleanTitle $f.BaseName
  # Si el nombre tiene residuos irrecuperables (Latin Extendido, simbolos,
  # fullwidth...), preferir el tag title (con limpieza suave).
  $residual = $title -match '[\u0180-\u024F\u1E00-\u1EFF\u2000-\u2BFF\u2E00-\u2E7F\uFE00-\uFEFF\uFF00-\uFFEF]'
  if ($residual -and $meta.Title) {
    $t2 = ConvertTo-CleanMeta $meta.Title
    if ($t2) { $title = $t2 }
  }
  if (-not $title) { $title = $f.BaseName }

  $artist = ConvertTo-CleanMeta $meta.Artist
  if (-not $artist -and $f.BaseName -match '^(?<a>.+?)\s*-\s*(?<t>.+)$') {
    $artist = ConvertTo-CleanMeta $Matches['a']
  }

  $album = ConvertTo-CleanMeta $meta.Album

  # album_artist: si el original existe y difiere del artist (en forma
  # normalizada sin acentos), se conserva; si es redundante, se unifica.
  $metaAA = ConvertTo-CleanMeta $meta.AlbumArtist
  $newAA = $artist
  if ($metaAA -and (ConvertTo-NormalizedKey $metaAA) -cne (ConvertTo-NormalizedKey $artist)) {
    $newAA = $metaAA
  }

  $changed = ($title -cne $meta.Title) -or ($artist -cne $meta.Artist) -or
             ($album -cne $meta.Album) -or ($newAA -cne $meta.AlbumArtist)
  if (-not $changed -and -not $meta.Title) { $changed = $true }
  $plan.Add([pscustomobject]@{
    Path = $f.FullName
    Name = $f.Name
    CurTitle = $meta.Title
    CurArtist = $meta.Artist
    CurAlbum = $meta.Album
    CurAA = $meta.AlbumArtist
    NewTitle = $title
    NewArtist = $artist
    NewAlbum = $album
    NewAA = $newAA
    Changed = $changed
  }) | Out-Null
}

$toFix = @($plan | Where-Object { $_.Changed })

if (-not $Apply) {
  Write-Host ''
  Write-Host '== ENSAYO (no se escribio nada; usa -Apply para aplicar) ==' -ForegroundColor Yellow
  Write-Host ''
  foreach ($p in $toFix) {
    Write-Host "== $($p.Name)"
    Write-Host "   t: [$($p.CurTitle)] => [$($p.NewTitle)]"
    Write-Host "   a: [$($p.CurArtist)] => [$($p.NewArtist)]"
    Write-Host "   al: [$($p.CurAlbum)] => [$($p.NewAlbum)]"
    Write-Host "   aa: [$($p.CurAA)] => [$($p.NewAA)]"
    $report.Add("== $($p.Name)") | Out-Null
    $report.Add("   t: [$($p.CurTitle)] => [$($p.NewTitle)]") | Out-Null
    $report.Add("   a: [$($p.CurArtist)] => [$($p.NewArtist)]") | Out-Null
    $report.Add("   al: [$($p.CurAlbum)] => [$($p.NewAlbum)]") | Out-Null
    $report.Add("   aa: [$($p.CurAA)] => [$($p.NewAA)]") | Out-Null
  }
  Write-Host ''
  Write-Host "A reparar: $($toFix.Count) de $($files.Count)"
  $report | Set-Content -LiteralPath $logPath -Encoding utf8
  Write-Host "Log: $logPath"
  exit 0
}

$ok = 0; $fail = 0
foreach ($p in $toFix) {
  try {
    $metaArgs = @{ srcPath = $p.Path; title = $p.NewTitle }
    if ($p.NewArtist) { $metaArgs['artist'] = $p.NewArtist }
    if ($p.NewAlbum)  { $metaArgs['album'] = $p.NewAlbum }
    if ($p.NewAA)     { $metaArgs['albumArtist'] = $p.NewAA }
    Write-AudioMeta @metaArgs
    $ok++
    $line = "OK  | $($p.Name)"
    Write-Host $line
    $report.Add($line) | Out-Null
  } catch {
    $fail++
    $line = "FAIL | $($p.Name): $($_.Exception.Message)"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
}

Write-Host ''
Write-Host "Reparados=$ok Fallidos=$fail (sin cambios: $($plan.Count - $toFix.Count))"
$report | Set-Content -LiteralPath $logPath -Encoding utf8
Write-Host "Log: $logPath"
exit 0
