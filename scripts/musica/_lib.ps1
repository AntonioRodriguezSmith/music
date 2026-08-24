#Requires -Version 5.1
<#
.SYNOPSIS
  Libreria compartida del pipeline de musica (dot-source desde 01-04).
.DESCRIPTION
  Funciones comunes a los 4 pasos: resolucion de carpeta/ffmpeg, lectura y
  escritura de metadatos (ffmetadata UTF-8), limpieza de texto y mojibake,
  y normalizacion de claves. Define $script:Ff con el binario ffmpeg y
  $script:MusicRepoRoot con la raiz del repo.
#>

$script:MusicRepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

function Resolve-TargetDir {
  param([string]$Explicit)
  if ($Explicit) { return $Explicit }
  if ($env:CLIP_HARBOUR_PLAYER_DIR) { return $env:CLIP_HARBOUR_PLAYER_DIR }
  $envFile = Join-Path $script:MusicRepoRoot '.env'
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
    (Join-Path $script:MusicRepoRoot 'src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe')
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

function Get-AudioMeta {
  param(
    [string]$path,
    [string]$ff,
    [switch]$Bitrate
  )
  $result = [pscustomobject]@{ Title = ''; Artist = ''; Album = ''; AlbumArtist = ''; Bitrate = 0 }
  if (-not $ff) { $ff = $script:Ff }
  if (-not $ff) { return $result }
  # Escribir el ffmetadata a un archivo temporal evita que la consola decodifique
  # la salida nativa con la pagina de codigos (corrompe acentos/emoji UTF-8).
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
  # El bitrate se lee del stderr de ffmpeg (solo diagnostico, opt-in).
  if ($Bitrate) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $diag = & $ff -hide_banner -i $path 2>&1 | Out-String
    } finally {
      $ErrorActionPreference = $prev
    }
    if ($diag -match '(\d+)\s*kb/s') { $result.Bitrate = [int]$Matches[1] }
  }
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
  $t = $t -replace "(?i)\s*-\s*(?:official\s+)?(?:street\s+)?(?:video|audio|visualizer|video oficial|audio oficial)\s*$", ''
  # Apostrofes rizados -> apostrofe recto; ! y ? son texto normal en espanol.
  $t = $t -replace "[’‘]", "'"
  # Solo texto: letras, numeros, espacios y signos basicos. Emoji/simbolos -> espacio.
  $t = $t -replace "[^\p{L}\p{N}\p{Z}\p{M}\u2013\u2014._()&'!?+#:;¡¿-]", ' '
  # Normaliza guiones y espacios.
  $t = $t -replace '[\u2013\u2014\u2212]', '-'
  $t = $t -replace '\(\s+', '(' -replace '\s+\)', ')'
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

function ConvertTo-StripAccents([string]$s) {
  if (-not $s) { return $s }
  $norm = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $norm.ToCharArray()) {
    $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
    if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      $sb.Append($ch) | Out-Null
    }
  }
  return $sb.ToString()
}

function ConvertTo-NormalizedKey([string]$s) {
  # Clave normalizada (sin acentos, minusculas, solo a-z0-9) para agrupar
  # equivalencias: Nejo/N\u00e9jo -> nejo. Tambien quita no-alfanumericos.
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

function ConvertTo-SafeFileName([string]$name) {
  $invalid = [IO.Path]::GetInvalidFileNameChars()
  $n = $name
  foreach ($c in $invalid) { $n = $n.Replace([string]$c, '') }
  $n = $n -replace '\s{2,}', ' '
  return $n.Trim().TrimEnd('.')
}

function Get-MusicFiles([string]$dir) {
  return @(Get-ChildItem -LiteralPath $dir -File -Recurse | Where-Object {
    $_.Extension -match '\.(m4a|mp3|webm|opus|ogg|aac|flac)$' -and
    $_.FullName -notmatch '\\\.duplicados\\' -and
    $_.Name -notmatch '^__tag_' -and $_.Name -notmatch '(?i)\.temp\.'
  } | Sort-Object FullName)
}

function Set-MetaKey([string]$blob, [string]$key, [string]$value) {
  # Division POR LINEA (no por caracter): la metadata global termina en la
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
  # $null (o '') elimina la clave; no pasar el parametro = no tocar el tag.
  $ff = $script:Ff
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

$script:Ff = Find-Ffmpeg
