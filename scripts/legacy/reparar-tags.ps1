#Requires -Version 5.1
<#
.SYNOPSIS
  Repara los metadatos (tags) de los archivos de audio de la carpeta de música.

.DESCRIPTION
  Estrategia (elegida por el usuario):
    - TITULO  = nombre de archivo (ya normalizado/limpio). Si el nombre tiene
                residuos irrecuperables (emoji corrupto), se usa el tag title.
    - ARTISTA = tag artist actual decodificado de mojibake; si no hay, se
                deriva del patron "Artista - Titulo" del nombre de archivo.
    - ALBUM   = tag album actual decodificado de mojibake.

  La decodificacion de mojibake revierte los acentos corruptos (tipo "Ojal├í",
  "maÃ±ana") que dejaron los tags de muchas descargas. Solo actua cuando el
  texto contiene caracteres sospechosos (controles, ├─ cajas, Ã, ±, etc.) y la
  decodificacion los elimina; los acentos validos NO se tocan.

  ORDEN RECOMENDADO (PASO 2 - opcional):
    1. normalizar-musica.ps1      (nombres + metadatos + duplicados)
    2. reparar-tags.ps1           (ESTE: reparacion profunda de tags)
    3. unificar-interpretes.ps1   (unificar interpretes + nombres finales)
    4. organizar-interpretes.ps1  (carpetas por interprete)

  La carpeta objetivo se resuelve igual que normalizar-musica.ps1:
    1. -Dir <ruta>
    2. $env:CLIP_HARBOUR_PLAYER_DIR
    3. VITE_DEFAULT_DOWNLOAD_PATH en el .env del repo
    4. %USERPROFILE%\Music\MEmu video

  Por defecto es un ENSAYO (no escribe nada). Usa -Apply para aplicar.
  Los tags se reescriben con ffmpeg sin recodificar el audio (-c copy).

.PARAMETER Dir
  Ruta de la carpeta de musica a reparar.

.PARAMETER Apply
  Aplica los cambios (escribe los tags).

.EXAMPLE
  .\reparar-tags.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\reparar-tags.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path $env:TEMP 'reparar-tags.log'
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
  $result = [pscustomobject]@{ Title = ''; Artist = ''; Album = ''; AlbumArtist = '' }
  if (-not $ff) { return $result }
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
  return $result
}

function ConvertFrom-Mojibake([string]$s) {
  if (-not $s) { return $s }
  $result = $s
  for ($pass = 0; $pass -lt 5; $pass++) {
    $improved = $false
    foreach ($cp in @(437, 850, 1252, 28591)) {
      try {
        $e = [Text.Encoding]::GetEncoding($cp)
        $bytes = $e.GetBytes($result)
        $decoded = [Text.Encoding]::UTF8.GetString($bytes)
        if ($decoded.IndexOf([char]0xFFFD) -ge 0) { continue }
        if ($decoded -ceq $result) { continue }
        $susp = '[\u0080-\u009F\u00C2\u00C3\u00B1\u00E2\u2500-\u257F\u2310]'
        $suspOrig = ([regex]::Matches($result, $susp)).Count
        $suspNew = ([regex]::Matches($decoded, $susp)).Count
        if ($suspNew -lt $suspOrig) {
          $result = $decoded; $improved = $true; break
        }
      } catch { }
    }
    if (-not $improved) { break }
  }
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
  $t = $t -replace "[’‘]", "'"
  $t = $t -replace "[^\p{L}\p{N}\p{Z}\p{M}\u2013\u2014._()&'!?+#:;¡¿-]", ' '
  $t = $t -replace '[\u2013\u2014\u2212]', '-'
  $t = $t -replace '-{2,}', '-'
  $t = $t -replace '(?i)\s*[\(\[]\s*\d+\s*[\)\]]\s*$', ''
  $t = $t -replace '(?i)\s+-\s+copy\s*$', ''
  $t = $t -replace '(?i)\s+\(copy\)\s*$', ''
  $t = $t -replace '\s{2,}', ' '
  $t = $t.Trim()
  $t = $t -replace '^[-]+', '' -replace '[-]+$', ''
  return $t.Trim().TrimEnd('.')
}

function ConvertTo-NormKey([string]$s) {
  # Forma normalizada (sin acentos, minusculas) para comparar equivalencias.
  if (-not $s) { return '' }
  $t = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $t.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne 'NonSpacingMark') {
      [void]$sb.Append($ch)
    }
  }
  return $sb.ToString().ToLowerInvariant()
}

function ConvertTo-CleanMeta([string]$s) {
  # Limpieza suave para artist/album: conserva comas, guiones, &, $, parentesis.
  if (-not $s) { return '' }
  $t = ConvertFrom-Mojibake $s
  $t = $t.Trim()
  $t = $t -replace '^["“”«»＂]+|["“”«»＂]+$', ''
  $t = $t -replace "[’‘]", "'"
  # Quita emojis/símbolos raros conservando texto y puntuación común.
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

$dir = Resolve-TargetDir -Explicit $Dir
if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
  throw "Carpeta no encontrada: $dir"
}
$dir = (Get-Item -LiteralPath $dir).FullName
Write-Host "Carpeta objetivo: $dir"

$ff = Find-Ffmpeg
if (-not $ff) { throw "ffmpeg no encontrado" }
Write-Host "ffmpeg: $ff"

$files = @(Get-ChildItem -LiteralPath $dir -File -Recurse | Where-Object {
  $_.Extension -match '\.(m4a|mp3|webm|opus|ogg|aac|flac)$' -and
  $_.FullName -notmatch '\\\.duplicados\\' -and
  $_.Name -notmatch '^__tag_' -and $_.Name -notmatch '(?i)\.temp\.'
})

$plan = New-Object System.Collections.Generic.List[object]
foreach ($f in $files) {
  $meta = Get-AudioMeta -path $f.FullName -ff $ff
  $title = ConvertTo-CleanTitle $f.BaseName
  # Si el nombre tiene residuos irrecuperables (Latin Extendido, símbolos,
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
  if ($metaAA -and (ConvertTo-NormKey $metaAA) -cne (ConvertTo-NormKey $artist)) {
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
