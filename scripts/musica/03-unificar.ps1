#Requires -Version 5.1
<#
.SYNOPSIS
  PASO 3 del pipeline: unifica interpretes y revisa/normaliza los nombres de
  archivo de la carpeta de musica.

.DESCRIPTION
  DECISIONES CONFIRMADAS POR EL USUARIO:
    - Interpretes (artist + album_artist): Title Case unificado.
        BAD BUNNY -> Bad Bunny | YUNG BEEF AKA LANA DEL REY -> Yung Beef
        DABABY/DaBaby -> Dababy | GetRichZay -> Get Rich Zay ...
    - Nombres de archivo / titulos: solo primera mayuscula + SIN acentos.
        DeBÍ TiRAR MáS FOToS.m4a -> Debi tirar mas fotos.m4a
    - Archivos con prefijo "ARTIST - TITULO" (p.ej. "YUNG BEEF - RELIGION"):
        se renombran a solo el titulo y el artista se escribe en el tag.

  Por defecto es un ENSAYO (no escribe nada). Usa -Apply para aplicar.
  Los tags se reescriben con ffmpeg sin recodificar el audio (-c copy).

.PARAMETER Dir
  Ruta de la carpeta de musica a normalizar (se resuelve desde _lib.ps1 si se omite).

.PARAMETER Apply
  Aplica los cambios (renombra archivos y reescribe tags).

.EXAMPLE
  .\03-unificar.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\03-unificar.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_lib.ps1')
$logPath = Join-Path $env:TEMP '03-unificar.log'
$report = New-Object System.Collections.Generic.List[string]

$script:ArtistAcronyms = @('MC', 'DJ', 'AKA', 'PMP', 'DAPS', 'YRB', 'GW', 'CN', 'XS', 'DMAX', 'MDMA', 'BMF', 'YNWA', 'WTW')
$script:ArtistSmall = @('de', 'del', 'da', 'do', 'la', 'y', 'e', 'o', 'a', 'al', 'con', 'en')
# Titulos estilizados conocidos que deben conservar su forma.
$script:TitleOverrides = @{
  'nuevayol' = 'Nueva Yol'
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
  # Override de titulos estilizados conocidos.
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
