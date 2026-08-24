#Requires -Version 5.1
<#
.SYNOPSIS
  Normaliza la carpeta de música de Clip Harbour: elimina duplicados y limpia
  los nombres de archivo dejando solo texto legible (quita emoji, símbolos,
  IDs de YouTube y marcas tipo "Official Video").

.DESCRIPTION
  La carpeta objetivo se resuelve en este orden:
    1. -Dir <ruta>  (explícita; recomendada si la carpeta fue elegida en la app)
    2. $env:CLIP_HARBOUR_PLAYER_DIR   (la que usa Rust para el reproductor)
    3. VITE_DEFAULT_DOWNLOAD_PATH en el .env del repo
    4. %USERPROFILE%\Music\MEmu video  (predeterminado de la app)

  La ruta que se guarda en la app al pulsar "Elegir carpeta" vive en el
  localStorage del WebView y no es legible desde PowerShell: pásala con -Dir.

  Por defecto es un ENSAYO (no toca nada). Usa -Apply para aplicar.
  Los duplicados se mueven a .duplicados; usa -DeleteDuplicates para borrarlos.

  La deduplicación y la limpieza usan el NOMBRE DE ARCHIVO como fuente principal
  (los tags de muchos archivos descargados llegan corruptos/mojibake y no son
  fiables). El bitrate (ffmpeg) solo se usa para elegir cuál copia duplicada se
  conserva. Dos canciones con el mismo título pero artistas distintos NO se
  consideran duplicadas.

  ADEMAS limpia los metadatos de los archivos conservados: el titulo se escribe
  desde el nombre de archivo limpio y el artista/album se decodifican de
  mojibake y se limpian con una limpieza suave (ConvertTo-CleanMeta). Si no hay
  ffmpeg, la limpieza de metadatos se omite (solo nombres y duplicados).

  ORDEN RECOMENDADO (PASO 1):
    1. normalizar-musica.ps1      (ESTE: nombres + metadatos + duplicados)
    2. reparar-tags.ps1           (opcional: reparacion profunda de tags)
    3. unificar-interpretes.ps1   (unificar interpretes + nombres finales)
    4. organizar-interpretes.ps1  (carpetas por interprete)

.PARAMETER Dir
  Ruta de la carpeta de descargas/música a normalizar.

.PARAMETER Apply
  Aplica los cambios (renombra y mueve/borra duplicados).

.PARAMETER DeleteDuplicates
  Borra los duplicados en vez de moverlos a .duplicados.

.PARAMETER RemoveJunk
  Borra restos de descargas interrumpidas (*.part, *.ytdl).

.EXAMPLE
  .\normalizar-musica.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\normalizar-musica.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply -DeleteDuplicates -RemoveJunk
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply,
  [switch]$DeleteDuplicates,
  [switch]$RemoveJunk
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path $env:TEMP 'normalizar-musica.log'
$report = New-Object System.Collections.Generic.List[string]

function Resolve-TargetDir {
  param([string]$Explicit)
  if ($Explicit) { return $Explicit }
  if ($env:CLIP_HARBOUR_PLAYER_DIR) { return $env:CLIP_HARBOUR_PLAYER_DIR }
  $envFile = Join-Path $PSScriptRoot '..\.env'
  if (Test-Path -LiteralPath $envFile) {
    $m = Select-String -LiteralPath $envFile -Pattern '^\s*VITE_DEFAULT_DOWNLOAD_PATH\s*=\s*(.+?)\s*$' | Select-Object -First 1
    if ($m) {
      $val = $m.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
      if ($val) { return $val }
    }
  }
  return (Join-Path $env:USERPROFILE 'Music\MEmu video')
}

function Find-Ffmpeg {
  $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'clip_harbour-target\release\ffmpeg.exe'),
    (Join-Path $PSScriptRoot '..\src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe')
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  return ''
}

function Get-FfField([string]$blob, [string]$field) {
  $val = ''
  if ($blob -match "(?m)^${field}=(.+)$") { $val = $Matches[1].Trim() }
  elseif ($blob -match "(?im)^\s*${field}\s*:\s*(.+)$") { $val = $Matches[1].Trim() }
  # ffmpeg escapa \ = ; # al generar el ffmetadata; desescapar para el valor real.
  return $val -replace '\\([\\=;#])', '$1'
}

function Get-AudioMeta([string]$path, [string]$ff) {
  $result = [pscustomobject]@{ Title = ''; Artist = ''; Album = ''; AlbumArtist = ''; Bitrate = 0 }
  if (-not $ff) { return $result }
  # Escribir el ffmetadata a un archivo temporal evita que la consola decodifique
  # la salida nativa con la página de códigos (corrompe acentos/emoji UTF-8).
  $tmp = Join-Path $env:TEMP ('clip_meta_' + [guid]::NewGuid().ToString('N') + '.txt')
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $ff -hide_banner -i $path -f ffmetadata $tmp 2>$null
  } finally {
    $ErrorActionPreference = $prev
  }
  $raw = ''
  if (Test-Path -LiteralPath $tmp) {
    $raw = Get-Content -LiteralPath $tmp -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
  $result.Title = Get-FfField $raw 'title'
  $result.Artist = Get-FfField $raw 'artist'
  $result.Album = Get-FfField $raw 'album'
  $result.AlbumArtist = Get-FfField $raw 'album_artist'
  # El bitrate se lee del stderr de ffmpeg (diagnóstico).
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $diag = & $ff -hide_banner -i $path 2>&1 | Out-String
  } finally {
    $ErrorActionPreference = $prev
  }
  if ($diag -match '(\d+)\s*kb/s') { $result.Bitrate = [int]$Matches[1] }
  return $result
}

function ConvertTo-CleanTitle([string]$s) {
  if (-not $s) { return '' }
  $t = ConvertFrom-Mojibake $s
  $t = $t.Trim()
  $t = $t -replace '^["“”«»]+|["“”«»]+$', ''
  $t = $t -replace '(?i)\s*[\(\[](?:official\s*)?(?:video|audio|visualizer|lyric\s*video|music\s*video|video oficial|audio oficial|official audio|official video|video visual|short film)[^\)\]]*[\)\]]', ''
  $t = $t -replace '(?i)\s*\((?:prod\.?\s*by|produced by|shot by|video by)[^)]*\)', ''
  $t = $t -replace '(?i)\s+(?:prod\.?\s*by|produced by|shot by)\s+\S.*$', ''
  $t = $t -replace '(?i)\s+HD\s*$', ''
  $t = $t -replace '\s*\[[\w-]{11}\]\s*$', ''
  $t = $t -replace '\s*\([\w-]{11}\)\s*$', ''
  # Apóstrofes rizados -> apóstrofe recto; ¡ y ¿ son texto normal en español.
  $t = $t -replace "[’‘]", "'"
  # Solo texto: letras, números, espacios y signos básicos. Emoji/símbolos -> espacio.
  $t = $t -replace "[^\p{L}\p{N}\p{Z}\p{M}\u2013\u2014._()&'!?+#:;¡¿-]", ' '
  # Normaliza guiones y espacios.
  $t = $t -replace '[\u2013\u2014\u2212]', '-'
  $t = $t -replace '-{2,}', '-'
  # Sufijos de copia o descarga repetida: " (1)", " [2]", " - Copy", " (copy)".
  $t = $t -replace '(?i)\s*[\(\[]\s*\d+\s*[\)\]]\s*$', ''
  $t = $t -replace '(?i)\s+-\s+copy\s*$', ''
  $t = $t -replace '(?i)\s+\(copy\)\s*$', ''
  $t = $t -replace '\s{2,}', ' '
  $t = $t.Trim()
  $t = $t -replace '^[-]+', '' -replace '[-]+$', ''
  return $t.Trim().TrimEnd('.')
}

function ConvertTo-CleanMeta([string]$s) {
  # Limpieza suave para artist/album: conserva comas, guiones, &, $, parentesis.
  if (-not $s) { return '' }
  $t = ConvertFrom-Mojibake $s
  $t = $t.Trim()
  $t = $t -replace '^["“”«»＂]+|["“”«»＂]+$', ''
  $t = $t -replace "[’‘]", "'"
  $t = $t -replace "[^\p{L}\p{N}\p{Z}\p{M}._&$@+\-,:;()\[\]'""!?*#¡¿/\\|%]", ' '
  $t = $t -replace '\s{2,}', ' '
  $t = $t -replace '\s+([,;:])', '$1'
  return $t.Trim().TrimEnd('.')
}

function Set-MetaKey([string]$blob, [string]$key, [string]$value) {
  # División POR LÍNEA (no por carácter): la metadata global termina en la
  # primera linea que empieza con '[' (seccion [CHAPTER]/[STREAM]). Esto evita
  # romper valores legitimos que contienen '[' (p.ej. "Foo [Live]").
  $nl = "`n"
  $lines = $blob -replace "`r`n", $nl -split $nl
  $sectionIdx = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*\[') { $sectionIdx = $i; break }
  }
  $head = @()
  $tail = @()
  if ($sectionIdx -ge 0) {
    if ($sectionIdx -gt 0) { $head = @($lines[0..($sectionIdx - 1)]) }
    $tail = @($lines[$sectionIdx..($lines.Count - 1)])
  } else {
    $head = @($lines)
  }
  # Quitar la clave existente (global, no en secciones).
  $pattern = '^\s*' + [regex]::Escape($key) + '\s*='
  $head = @($head | Where-Object { $_ -notmatch $pattern })
  if ($value) {
    $valueEsc = $value -replace '([\\=;#])', '\$1'
    $head += ($key + '=' + $valueEsc)
  }
  return (($head + $tail) -join $nl)
}

function Write-AudioMeta {
  param(
    [string]$srcPath,
    [AllowNull()][string]$title,
    [AllowNull()][string]$artist,
    [AllowNull()][string]$album,
    [AllowNull()][string]$albumArtist,
    [string]$finalPath
  )
  # Solo se setean las claves que el llamador pasa explicitamente. Un valor
  # $null (o '' ) elimina la clave; no pasar el parametro = no tocar el tag.
  $ext = [IO.Path]::GetExtension($srcPath)
  if (-not $finalPath) { $finalPath = $srcPath }
  $tmp = Join-Path ([IO.Path]::GetDirectoryName($srcPath)) ('__tag_' + [guid]::NewGuid().ToString('N') + $ext)
  $inMeta = Join-Path $env:TEMP ('clip_meta_in_' + [guid]::NewGuid().ToString('N') + '.txt')
  $outMeta = Join-Path $env:TEMP ('clip_meta_out_' + [guid]::NewGuid().ToString('N') + '.txt')
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $ff -hide_banner -i $srcPath -f ffmetadata $inMeta 2>$null
  } finally {
    $ErrorActionPreference = $prev
  }
  $blob = ''
  if (Test-Path -LiteralPath $inMeta) {
    $blob = Get-Content -LiteralPath $inMeta -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $inMeta -Force -ErrorAction SilentlyContinue
  }
  if (-not $blob) { $blob = ';FFMETADATA1' }
  if ($PSBoundParameters.ContainsKey('title'))       { $blob = Set-MetaKey $blob 'title'        $title }
  if ($PSBoundParameters.ContainsKey('artist'))      { $blob = Set-MetaKey $blob 'artist'        $artist }
  if ($PSBoundParameters.ContainsKey('albumArtist')) { $blob = Set-MetaKey $blob 'album_artist'  $albumArtist }
  if ($PSBoundParameters.ContainsKey('album'))       { $blob = Set-MetaKey $blob 'album'         $album }
  [IO.File]::WriteAllText($outMeta, $blob, (New-Object System.Text.UTF8Encoding $false))
  $ffArgs = @('-hide_banner', '-y', '-i', $srcPath, '-i', $outMeta, '-map_metadata', '1', '-c', 'copy')
  if ($ext -eq '.mp3') { $ffArgs += @('-id3v2_version', '3') }
  $ffArgs += $tmp
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $ff @ffArgs 2>$null
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  Remove-Item -LiteralPath $outMeta -Force -ErrorAction SilentlyContinue
  if ($code -ne 0 -or -not (Test-Path -LiteralPath $tmp) -or ((Get-Item -LiteralPath $tmp).Length -lt 1000)) {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    throw "ffmpeg tag failed exit=$code"
  }
  $sameExact = [string]::Equals($finalPath, $srcPath, [StringComparison]::Ordinal)
  Remove-Item -LiteralPath $srcPath -Force -ErrorAction SilentlyContinue
  if (-not $sameExact) {
    if ([IO.File]::Exists($finalPath)) { throw "Destino ya existe: $finalPath" }
  }
  [IO.File]::Move($tmp, $finalPath)
}

function ConvertTo-SafeFileName([string]$name) {
  $invalid = [IO.Path]::GetInvalidFileNameChars()
  $n = $name
  foreach ($c in $invalid) { $n = $n.Replace([string]$c, '') }
  $n = $n -replace '\s{2,}', ' '
  return $n.Trim().TrimEnd('.')
}

function ConvertFrom-Mojibake([string]$s) {
  if (-not $s) { return $s }
  # Muchos archivos descargados traen acentos corruptos tipo "Ojal├í" (los bytes
  # UTF-8 se leyeron como CP437/CP850). Solo actúa si hay caracteres de cajas.
  if ($s -notmatch '[\u2500-\u257F\u2310]') { return $s }
  $candidates = @(
    [Text.Encoding]::GetEncoding(850),
    [Text.Encoding]::GetEncoding(437),
    [Text.Encoding]::GetEncoding(1252)
  )
  foreach ($enc in $candidates) {
    try {
      $bytes = $enc.GetBytes($s)
      $decoded = [Text.Encoding]::UTF8.GetString($bytes)
      if ($decoded.IndexOf([char]0xFFFD) -ge 0) { continue }
      if ($decoded -ceq $s) { continue }
      if (-not ($decoded -match '\p{L}')) { continue }
      return $decoded
    } catch { }
  }
  return $s
}

function ConvertTo-NormalizedKey([string]$s) {
  if (-not $s) { return '' }
  $t = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $t.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne 'NonSpacingMark') {
      [void]$sb.Append($ch)
    }
  }
  $t = $sb.ToString().ToLowerInvariant()
  $t = $t -replace 'ñ', 'n'
  $t = $t -replace '[^a-z0-9]+', ''
  return $t
}

function Get-QualityScore($f) {
  $extScore = switch -Regex ($f.Ext.ToLower()) {
    '\.(m4a|mp3|flac)$' { 10 }
    '\.(aac|opus)$'     { 8 }
    default             { 5 }
  }
  return $extScore * 1000000 + [int]$f.Bitrate * 1000 + [int]$f.Length
}

$dir = Resolve-TargetDir -Explicit $Dir
if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
  throw "Carpeta no encontrada: $dir"
}
$dir = (Get-Item -LiteralPath $dir).FullName
Write-Host "Carpeta objetivo: $dir"

$ff = Find-Ffmpeg
if ($ff) {
  Write-Host "ffmpeg: $ff"
} else {
  Write-Host "Aviso: no se encontro ffmpeg; la deduplicacion usara solo el nombre de archivo."
}

$audioExt = '\.(m4a|mp3|webm|opus|ogg|aac|flac)$'
$all = Get-ChildItem -LiteralPath $dir -File -Recurse | Where-Object {
  $_.FullName -notmatch '\\\.duplicados\\' -and
  $_.Name -notmatch '^__tag_' -and $_.Name -ne 'desktop.ini'
}
$audio = @($all | Where-Object {
  $_.Extension -match $audioExt -and $_.Name -notmatch '(?i)\.temp\.(m4a|mp3|webm|opus|ogg|aac|flac)$'
})
$junk = @($all | Where-Object {
  $_.Extension -match '\.(part|ytdl)$' -or $_.Name -match '(?i)\.temp\.(m4a|mp3|webm|opus|ogg|aac|flac)$'
})

$items = New-Object System.Collections.Generic.List[object]
$trackN = 0
foreach ($f in $audio) {
  $trackN++
  $meta = Get-AudioMeta -path $f.FullName -ff $ff
  # El nombre de archivo es la fuente principal: los tags de muchos archivos
  # reales estan corruptos (mojibake) y no son fiables.
  $clean = ConvertTo-CleanTitle $f.BaseName
  if (-not $clean) { $clean = ConvertTo-CleanMeta $meta.Title }
  if (-not $clean) { $clean = "track $trackN" }
  $safe = ConvertTo-SafeFileName $clean
  if (-not $safe) { $safe = "track $trackN" }
  # Artista para desambiguar colisiones: parte antes de " - " en el nombre.
  $artist = ''
  if ($safe -match '^(?<a>.+?)\s*-\s*(?<t>.+)$') {
    $a = ConvertTo-SafeFileName (ConvertTo-CleanTitle $Matches['a'])
    if ($a) { $artist = $a }
  }
  $metaArtist = ConvertTo-CleanMeta $meta.Artist
  if (-not $metaArtist -and $artist) { $metaArtist = $artist }
  $metaAlbum = ConvertTo-CleanMeta $meta.Album
  # album_artist: si el original existe y difiere del artist (en forma
  # normalizada sin acentos), se conserva; si es redundante, se unifica.
  $metaAA = ConvertTo-CleanMeta $meta.AlbumArtist
  $newAA = $metaArtist
  if ($metaAA -and (ConvertTo-NormalizedKey $metaAA) -cne (ConvertTo-NormalizedKey $metaArtist)) {
    $newAA = $metaAA
  }
  $tagsChanged = ($safe -cne $meta.Title) -or ($metaArtist -cne $meta.Artist) -or
                 ($metaAlbum -cne $meta.Album) -or ($newAA -cne $meta.AlbumArtist)
  if (-not $tagsChanged -and -not $meta.Title) { $tagsChanged = $true }

  $items.Add([pscustomobject]@{
    Path        = $f.FullName
    OldName     = $f.Name
    Ext         = $f.Extension
    Title       = $safe
    Artist      = $artist
    Key         = ConvertTo-NormalizedKey $safe
    ArtistKey   = ConvertTo-NormalizedKey $artist
    Bitrate     = $meta.Bitrate
    Length      = $f.Length
    DupOf       = ''
    Keep        = $true
    Action      = 'KEEP'
    FinalName   = ''
    TagTitle    = $meta.Title
    TagArtist   = $meta.Artist
    TagAlbum    = $meta.Album
    TagAA       = $meta.AlbumArtist
    MetaArtist  = $metaArtist
    MetaAlbum   = $metaAlbum
    MetaAA      = $newAA
    TagsChanged = $tagsChanged
  }) | Out-Null
}

# --- Deduplicacion: misma canción (mismo título normalizado y mismo artista). ---
$byKey = @($items | Group-Object Key)
foreach ($g in $byKey) {
  if (@($g.Group).Count -le 1) { continue }
  $byArtist = @($g.Group | Group-Object ArtistKey)
  foreach ($ag in $byArtist) {
    if (@($ag.Group).Count -le 1) { continue }
    $sorted = @($ag.Group | Sort-Object -Property @{ e = { Get-QualityScore $_ } } -Descending)
    $best = $sorted[0]
    for ($i = 1; $i -lt $sorted.Count; $i++) {
      $sorted[$i].Keep = $false
      $sorted[$i].DupOf = $best.OldName
      $sorted[$i].Action = 'DUP'
    }
  }
}

# --- Plan de renombrado (solo los que se quedan). ---
$used = @{}
foreach ($i in $items) {
  # Los duplicados se mueven/borran primero: su nombre queda libre para reutilizarlo.
  if ($i.Keep) { $used[$i.OldName.ToLowerInvariant()] = $true }
}
$plan = New-Object System.Collections.Generic.List[object]
foreach ($i in $items) {
  if (-not $i.Keep) { continue }
  [void]$used.Remove($i.OldName.ToLowerInvariant())

  $candidate = $i.Title + $i.Ext
  $candidateLow = $candidate.ToLowerInvariant()
  if (-not $used.ContainsKey($candidateLow)) {
    $i.FinalName = $candidate
    if ($i.OldName.ToLowerInvariant() -ne $candidateLow) { $i.Action = 'RENAME' }
  } else {
    if ($i.Artist) {
      $alt = "$($i.Title) - $($i.Artist)$($i.Ext)"
      if (-not $used.ContainsKey($alt.ToLowerInvariant())) { $candidate = $alt }
    }
    if ($used.ContainsKey($candidate.ToLowerInvariant())) {
      $n = 2
      do {
        $candidate = '{0} ({1}){2}' -f $i.Title, $n, $i.Ext
        $n++
      } while ($used.ContainsKey($candidate.ToLowerInvariant()))
    }
    $i.FinalName = $candidate
    $i.Action = 'RENAME'
  }
  $used[$i.FinalName.ToLowerInvariant()] = $true
  $plan.Add($i) | Out-Null
}

$renamed = @($plan | Where-Object { $_.Action -eq 'RENAME' })
$dups = @($items | Where-Object { -not $_.Keep })

if (-not $Apply) {
  Write-Host ''
  Write-Host '== ENSAYO (nada fue modificado; usa -Apply para aplicar) ==' -ForegroundColor Yellow
  Write-Host ''
  foreach ($i in $renamed) {
    $line = "RENAME | $($i.OldName)  =>  $($i.FinalName)"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
  foreach ($d in $dups) {
    $line = "DUP    | $($d.OldName)  (se conserva: $($d.DupOf))"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
  foreach ($j in $junk) {
    $line = "JUNK   | $($j.Name)"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
  $tagChanges = @($plan | Where-Object { $_.TagsChanged })
  foreach ($i in $tagChanges) {
    $line = "TAGS   | $($i.FinalName) | title: [$($i.TagTitle)] => [$($i.Title)] | artist: [$($i.TagArtist)] => [$($i.MetaArtist)] | album: [$($i.TagAlbum)] => [$($i.MetaAlbum)] | album_artist: [$($i.TagAA)] => [$($i.MetaAA)]"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
  Write-Host ''
  Write-Host ("Resumen: Renombrar={0} Duplicados={1} Junk={2} Tags={3}" -f $renamed.Count, $dups.Count, $junk.Count, $tagChanges.Count)
  $report | Set-Content -LiteralPath $logPath -Encoding utf8
  Write-Host "Log: $logPath"
  exit 0
}

# --- Aplicar. ---
if ($dups.Count -gt 0 -and -not $DeleteDuplicates) {
  $dupDir = Join-Path $dir '.duplicados'
  if (-not (Test-Path -LiteralPath $dupDir -PathType Container)) {
    New-Item -ItemType Directory -Path $dupDir | Out-Null
  }
  foreach ($d in $dups) {
    try {
      $dupTarget = Join-Path $dupDir $d.OldName
      $n = 2
      while ([IO.File]::Exists($dupTarget)) {
        $dupTarget = Join-Path $dupDir ('{0} ({1}){2}' -f [IO.Path]::GetFileNameWithoutExtension($d.OldName), $n, $d.Extension)
        $n++
      }
      Move-Item -LiteralPath $d.Path -Destination $dupTarget -Force
      $line = "DUP_MOVE   | $($d.OldName)  =>  .duplicados\ (se conserva: $($d.DupOf))"
      Write-Host $line
      $report.Add($line) | Out-Null
    } catch {
      $line = "FAIL       | $($d.OldName): $($_.Exception.Message)"
      Write-Host $line
      $report.Add($line) | Out-Null
    }
  }
}

foreach ($d in $dups) {
  if (-not $DeleteDuplicates) { break }
  try {
    Remove-Item -LiteralPath $d.Path -Force
    $line = "DUP_DELETE | $($d.OldName)  (se conserva: $($d.DupOf))"
    Write-Host $line
    $report.Add($line) | Out-Null
  } catch {
    $line = "FAIL       | $($d.OldName): $($_.Exception.Message)"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
}

foreach ($i in $renamed) {
  try {
    $target = Join-Path ([IO.Path]::GetDirectoryName($i.Path)) $i.FinalName
    if ((Test-Path -LiteralPath $target) -and ($target -ne $i.Path)) {
      throw "el destino ya existe: $($i.FinalName)"
    }
    Rename-Item -LiteralPath $i.Path -NewName $i.FinalName -Force
    $line = "RENAME     | $($i.OldName)  =>  $($i.FinalName)"
    Write-Host $line
    $report.Add($line) | Out-Null
  } catch {
    $line = "FAIL       | $($i.OldName): $($_.Exception.Message)"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
}

$tagFixes = @($plan | Where-Object { $_.TagsChanged })
if ($ff -and $tagFixes.Count -gt 0) {
  Write-Host ''
  Write-Host '== Limpieza de metadatos ==' -ForegroundColor Cyan
  foreach ($i in $tagFixes) {
    try {
      $target = Join-Path ([IO.Path]::GetDirectoryName($i.Path)) $i.FinalName
      $metaArgs = @{ srcPath = $target; title = $i.Title }
      if ($i.MetaArtist) { $metaArgs['artist'] = $i.MetaArtist }
      if ($i.MetaAlbum)  { $metaArgs['album'] = $i.MetaAlbum }
      if ($i.MetaAA)     { $metaArgs['albumArtist'] = $i.MetaAA }
      Write-AudioMeta @metaArgs
      $line = "TAGS_OK  | $($i.FinalName)"
      Write-Host $line
      $report.Add($line) | Out-Null
    } catch {
      $line = "FAIL     | $($i.FinalName): $($_.Exception.Message)"
      Write-Host $line
      $report.Add($line) | Out-Null
    }
  }
} elseif (-not $ff -and $tagFixes.Count -gt 0) {
  Write-Host ''
  Write-Host "Aviso: sin ffmpeg no se limpian metadatos ($($tagFixes.Count) archivos con tags por limpiar)."
}

if ($RemoveJunk) {
  foreach ($j in $junk) {
    try {
      Remove-Item -LiteralPath $j.FullName -Force
      $line = "JUNK_DELETE| $($j.Name)"
      Write-Host $line
      $report.Add($line) | Out-Null
    } catch {
      $line = "FAIL       | $($j.Name): $($_.Exception.Message)"
      Write-Host $line
      $report.Add($line) | Out-Null
    }
  }
}

Write-Host ''
Write-Host ("Resumen: Renombrados={0} Sin cambios={1} Duplicados={2} Tags={3}" -f $renamed.Count, ($plan.Count - $renamed.Count), $dups.Count, $tagFixes.Count)
$report | Set-Content -LiteralPath $logPath -Encoding utf8
Write-Host "Log: $logPath"
exit 0
