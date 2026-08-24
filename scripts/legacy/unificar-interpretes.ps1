#Requires -Version 5.1
<#
.SYNOPSIS
  Normaliza los interpretes (unificando mayusculas) y revisa/normaliza los
  nombres de archivo de la carpeta de musica.

.DESCRIPTION
  DECISIONES CONFIRMADAS POR EL USUARIO:
    - Interpretes (artist + album_artist): Title Case unificado.
        BAD BUNNY -> Bad Bunny | YUNG BEEF AKA LANA DEL REY -> Yung Beef
        DABABY/DaBaby -> Dababy | GetRichZay -> Get Rich Zay ...
    - Nombres de archivo / titulos: solo primera mayuscula + SIN acentos.
        DeBÍ TiRAR MáS FOToS.m4a -> Debi tirar mas fotos.m4a
    - Archivos con prefijo "ARTIST - TITULO" (p.ej. "YUNG BEEF - RELIGION"):
        se renombran a solo el titulo y el artista se escribe en el tag.

  La carpeta objetivo se resuelve igual que normalizar-musica.ps1:
    1. -Dir <ruta>
    2. $env:CLIP_HARBOUR_PLAYER_DIR
    3. VITE_DEFAULT_DOWNLOAD_PATH en el .env del repo
    4. %USERPROFILE%\Music\MEmu video

  ORDEN RECOMENDADO (PASO 3):
    1. normalizar-musica.ps1      (nombres + metadatos + duplicados)
    2. reparar-tags.ps1           (opcional: reparacion profunda de tags)
    3. unificar-interpretes.ps1   (ESTE: unificar interpretes + nombres finales)
    4. organizar-interpretes.ps1  (carpetas por interprete)

  Por defecto es un ENSAYO (no escribe nada). Usa -Apply para aplicar.
  Los tags se reescriben con ffmpeg sin recodificar el audio (-c copy).

.PARAMETER Dir
  Ruta de la carpeta de musica a normalizar.

.PARAMETER Apply
  Aplica los cambios (renombra archivos y reescribe tags).

.EXAMPLE
  .\unificar-interpretes.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\unificar-interpretes.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path $env:TEMP 'unificar-artistas.log'
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
  $result = [pscustomobject]@{ Title = ''; Artist = ''; AlbumArtist = '' }
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
  $t = $t -replace "(?i)\s*-\s*(?:official\s+)?(?:street\s+)?(?:video|audio|visualizer|video oficial|audio oficial)\s*$", ''
  $t = $t -replace "[’‘]", "'"
  $t = $t -replace "[^\p{L}\p{N}\p{Z}\p{M}\u2013\u2014._()&'!?+#:;¡¿-]", ' '
  $t = $t -replace '[\u2013\u2014\u2212]', '-'
  $t = $t -replace '\(\s+', '(' -replace '\s+\)', ')'
  $t = $t -replace '-{2,}', '-'
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

function Test-UglyCase([string]$s) {
  # Titulo "feo" estilo YouTube: palabra de 2+ letras toda en mayusculas
  # (p.ej. ACHO, STELL4RBLADE) o mayuscula a mitad de palabra (TURiSTA, BOKeTE).
  # Los acronimos conocidos (PMP, PR, MDMA...) se ignoran.
  if (-not $s) { return $false }
  $acr = '\b(?:' + (($script:ArtistAcronyms) -join '|') + ')\b'
  $tmp = [regex]::Replace($s, $acr, '')
  return [regex]::IsMatch($tmp, '\b\p{Lu}{2}[\p{Lu}\p{N}]*\b|(?<!\b)\p{Lu}')
}

function ConvertTo-SentenceCase([string]$s) {
  # Solo primera mayuscula. Protege acronimos punteados (A.B.C), acronimos
  # conocidos y palabras de una letra en ingles (I). Las vocales sueltas
  # espanolas (A, Y, E, O, U) van en minuscula salvo al inicio.
  if (-not $s) { return $s }
  $sb = New-Object System.Text.StringBuilder
  $pos = 0
  $first = $true
  $knownAcr = @('MC', 'DJ', 'AKA', 'PR', 'XS', 'YRB', 'PMP', 'DAPS', 'GW', 'CN', 'BMF', 'MDMA', 'YNWA', 'WTW')
  $singleLower = @('A', 'Y', 'E', 'O', 'U')
  foreach ($m in [regex]::Matches($s, '[\p{L}\p{N}][\p{L}\p{N}''.-]*')) {
    $sb.Append($s.Substring($pos, $m.Index - $pos).ToLowerInvariant()) | Out-Null
    $tok = $m.Value
    $append = $tok
    if ($tok -match '^(?:[A-Z]\.)+[A-Z.]*$' -or $tok -in $knownAcr) {
      $append = $tok
    } elseif ($tok -match '^[A-Z]$') {
      if ($tok -in $singleLower -and -not $first) { $append = $tok.ToLowerInvariant() }
      else { $append = $tok }
    } else {
      $low = $tok.ToLowerInvariant()
      if ($first) {
        $low = $low.Substring(0, 1).ToUpperInvariant() + $low.Substring(1)
      }
      $append = $low
    }
    $first = $false
    $sb.Append($append) | Out-Null
    $pos = $m.Index + $m.Length
  }
  $sb.Append($s.Substring($pos).ToLowerInvariant()) | Out-Null
  return $sb.ToString()
}

$script:ArtistAcronyms = @('MC', 'DJ', 'AKA', 'PMP', 'DAPS', 'YRB', 'GW', 'CN', 'XS', 'DMAX', 'MDMA', 'BMF', 'YNWA', 'WTW')
$script:ArtistSmall = @('de', 'del', 'da', 'do', 'la', 'y', 'e', 'o', 'a', 'al', 'con', 'en')
# Títulos estilizados conocidos que deben conservar su forma.
$script:TitleOverrides = @{
  'nuevayol' = 'Nueva Yol'
}

function ConvertTo-ArtistWord([string]$word, [bool]$first) {
  if (-not $word) { return '' }
  if ($word -in $script:ArtistAcronyms) { return $word }
  if ($word -match '^[A-Z]\.$') { return $word }
  if ($word -match '^[A-Z]$') { return $word }
  if (-not $first -and ($word.ToLowerInvariant() -in $script:ArtistSmall)) {
    return $word.ToLowerInvariant()
  }
  $subs = $word.Split('-')
  if ($subs.Count -eq 1) {
    $low = $word.ToLowerInvariant()
    if ($low.Length -eq 0) { return '' }
    return ($low.Substring(0, 1).ToUpperInvariant() + $low.Substring(1))
  }
  $out = @()
  foreach ($s in $subs) {
    if (-not $s) { $out += ''; continue }
    if ($s -in $script:ArtistAcronyms) { $out += $s; continue }
    $low = $s.ToLowerInvariant()
    if ($low.Length -eq 0) { $out += ''; continue }
    $out += ($low.Substring(0, 1).ToUpperInvariant() + $low.Substring(1))
  }
  return ($out -join '-')
}

function ConvertTo-ArtistPiece([string]$piece) {
  if (-not $piece) { return '' }
  $p = $piece.Trim()
  $p = $p -replace '^\$+', ''
  if ($p -match '(?i)^getrichzay$') { return 'Get Rich Zay' }
  if ($p -match '(?i)^nandatsunami$') { return 'NandaTsunami' }
  if ($p -match '(?i)^rainao$') { return 'RaiNao' }
  if ($p -match '(?i)^(da\s*baby|dababy)$') { return 'Dababy' }
  if ($p -match '(?i)^yrb\s*tezz$') { return 'YRB Tezz' }
  if ($p -match '(?i)^\$?tunna 4 vegas$') { return 'Stunna 4 Vegas' }
  $words = $p -split '\s+'
  $out = @()
  for ($i = 0; $i -lt $words.Count; $i++) {
    $w = $words[$i]
    if (-not $w) { continue }
    $out += (ConvertTo-ArtistWord -word $w -first ($i -eq 0))
  }
  return ($out -join ' ')
}

function ConvertTo-ArtistCase([string]$s) {
  if (-not $s) { return '' }
  $s = $s.Trim()
  if ($s -match '(?i)^yung beef(?: aka lana del rey)?$') { return 'Yung Beef' }
  if ($s -match '(?i)^tali(?: goya)?$') { return 'Tali Goya' }
  $pieces = [regex]::Split($s, '(?i)(,|\+|\&|\s+ft\.?\s+|\s+feat\.?\s+|\s+x\s+)')
  $out = @()
  foreach ($part in $pieces) {
    if ($part -match '^\s*(,|\+|\&|ft\.?|feat\.?|x)\s*$') {
      $sep = $Matches[1].Trim()
      if ($sep -match '(?i)^ft') { $out += 'ft.' }
      elseif ($sep -match '(?i)^x$') { $out += 'X' }
      else { $out += $sep }
      continue
    }
    $pc = ConvertTo-ArtistPiece $part
    if ($pc) { $out += $pc }
  }
  $result = ($out -join ' ')
  $result = $result -replace '\s+', ' '
  $result = $result -replace '\s*,', ','
  $result = $result -replace ',', ', '
  $result = $result -replace '\s*\+\s*', ' + '
  $result = $result -replace '\s*&\s*', ' & '
  $result = $result -replace '\s*ft\.\s*', ' ft. '
  $result = $result -replace '\s+', ' '
  return $result.Trim()
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
    & $script:ff -hide_banner -i $srcPath -f ffmetadata $inMeta 2>$null
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
    & $script:ff @ffArgs 2>$null
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

$script:ff = Find-Ffmpeg
if (-not $script:ff) { throw "ffmpeg no encontrado" }
Write-Host "ffmpeg: $($script:ff)"

$files = @(Get-ChildItem -LiteralPath $dir -File -Recurse | Where-Object {
  $_.Extension -match '\.(m4a|mp3|webm|opus|ogg|aac|flac)$' -and
  $_.FullName -notmatch '\\\.duplicados\\' -and
  $_.Name -notmatch '^__tag_' -and $_.Name -notmatch '(?i)\.temp\.'
} | Sort-Object FullName)

$plan = New-Object System.Collections.Generic.List[object]
foreach ($f in $files) {
  $meta = Get-AudioMeta -path $f.FullName -ff $script:ff

  $artistFromName = ''
  $titlePart = $f.BaseName
  # "ARTIST - TITULO" con prefijo YUNG BEEF (tambien "YUNG BEEF X ... - TITULO")
  $sepIdx = $f.BaseName.IndexOf(' - ', [StringComparison]::OrdinalIgnoreCase)
  if ($sepIdx -gt 0 -and $f.BaseName.Substring(0, $sepIdx) -match '(?i)^yung beef(.+)?$') {
    $artistFromName = $f.BaseName.Substring(0, $sepIdx).Trim()
    $titlePart = $f.BaseName.Substring($sepIdx + 3).Trim()
  } elseif ($f.BaseName -match '(?i)^(.+?) - yung beef$') {
    $artistFromName = 'YUNG BEEF'
    $titlePart = $Matches[1].Trim()
  }

  $clean = ConvertTo-CleanTitle $titlePart
  # Restos de emojis corruptos (ej: "ƒÅÜ Å" de un emoji de casa) en nombres.
  $clean = $clean -replace '[\u0192\u00C5\u00DC\u00A9]', ''
  $clean = $clean -replace '\s{2,}', ' '
  $clean = $clean.Trim()
  $noAcc = ConvertTo-StripAccents $clean
  if (-not $noAcc) { $noAcc = $f.BaseName }
  # Override de títulos estilizados conocidos.
  $normKey = ($noAcc.ToLowerInvariant() -replace '[^a-z0-9]', '')
  if ($script:TitleOverrides.ContainsKey($normKey)) {
    $noAcc = $script:TitleOverrides[$normKey]
  }

  $newBase = if (Test-UglyCase $noAcc) { ConvertTo-SentenceCase $noAcc } else { $noAcc }
  $newBase = $newBase.Trim().TrimEnd('.').Trim()

  $newArtist = if ($artistFromName) {
    ConvertTo-ArtistCase $artistFromName
  } else {
    ConvertTo-ArtistCase $meta.Artist
  }

  # album_artist: si el original existe y difiere del artist original (forma
  # normalizada sin acentos), se conserva unificado; si es redundante, se usa $newArtist.
  $metaAAClean = ConvertTo-CleanMeta $meta.AlbumArtist
  $newAA = $newArtist
  if ($metaAAClean) {
    $normAA = (ConvertTo-StripAccents $metaAAClean).ToLowerInvariant()
    $normOrigArtist = (ConvertTo-StripAccents (ConvertTo-CleanMeta $meta.Artist)).ToLowerInvariant()
    if ($normAA -cne $normOrigArtist) {
      $newAA = ConvertTo-ArtistCase $metaAAClean
    }
  }

  $newFile = $newBase + $f.Extension

  $changed = ($newFile -cne $f.Name) -or ($newBase -cne $meta.Title) -or
             ($newArtist -cne $meta.Artist) -or ($newAA -cne $meta.AlbumArtist)

  $plan.Add([pscustomobject]@{
    Path = $f.FullName
    OldName = $f.Name
    NewName = $newFile
    CurTitle = $meta.Title
    NewTitle = $newBase
    CurArtist = $meta.Artist
    NewArtist = $newArtist
    CurAlbumArtist = $meta.AlbumArtist
    NewAlbumArtist = $newAA
    Changed = $changed
    Collision = $false
  }) | Out-Null
}

# Detectar colisiones de nombre final (dentro de la misma carpeta).
$byName = @{}
foreach ($p in $plan) {
  $key = (Split-Path -Parent $p.Path) + '\' + $p.NewName.ToLowerInvariant()
  if ($byName.ContainsKey($key)) {
    $p.Collision = $true
    $byName[$key] = $byName[$key] + 1
  } else {
    $byName[$key] = 1
  }
}

$toChange = @($plan | Where-Object { $_.Changed -and -not $_.Collision })
$collisions = @($plan | Where-Object { $_.Collision })

if (-not $Apply) {
  Write-Host ''
  Write-Host '== ENSAYO (no se escribio nada; usa -Apply para aplicar) ==' -ForegroundColor Yellow
  foreach ($p in ($plan | Where-Object { $_.Changed })) {
    $line = "== $($p.OldName) => $($p.NewName)"
    Write-Host $line
    $report.Add($line) | Out-Null
    $report.Add("   title : [$($p.CurTitle)] => [$($p.NewTitle)]") | Out-Null
    $report.Add("   artist: [$($p.CurArtist)] => [$($p.NewArtist)]") | Out-Null
    $report.Add("   aa    : [$($p.CurAlbumArtist)] => [$($p.NewAlbumArtist)]") | Out-Null
    if ($p.Collision) {
      $report.Add("   COLLISION: este nombre final ya existe, se omite") | Out-Null
    }
  }
  if ($collisions.Count -gt 0) {
    $report.Add('') | Out-Null
    $report.Add("== COLISIONES (nombres finales duplicados)") | Out-Null
    foreach ($c in $collisions) {
      $report.Add("   $($c.OldName) => $($c.NewName)") | Out-Null
    }
  }
  Write-Host ''
  Write-Host "A cambiar: $($toChange.Count) de $($files.Count) (colisiones: $($collisions.Count))"
  $report | Set-Content -LiteralPath $logPath -Encoding utf8
  Write-Host "Log: $logPath"
  exit 0
}

$ok = 0; $fail = 0
foreach ($p in $toChange) {
  try {
    $finalPath = Join-Path ([IO.Path]::GetDirectoryName($p.Path)) $p.NewName
    $metaArgs = @{ srcPath = $p.Path; finalPath = $finalPath; title = $p.NewTitle; artist = $p.NewArtist }
    if ($p.NewAlbumArtist) { $metaArgs['albumArtist'] = $p.NewAlbumArtist }
    Write-AudioMeta @metaArgs
    $ok++
    $line = "OK  | $($p.OldName) => $($p.NewName)"
    Write-Host $line
    $report.Add($line) | Out-Null
  } catch {
    $fail++
    $line = "FAIL| $($p.OldName): $($_.Exception.Message)"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
}

Write-Host ''
Write-Host "OK=$ok FAIL=$fail (sin cambios: $($plan.Count - $toChange.Count))"
$report | Set-Content -LiteralPath $logPath -Encoding utf8
Write-Host "Log: $logPath"
exit 0
