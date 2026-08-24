#Requires -Version 5.1
<#
.SYNOPSIS
  Organiza las canciones en carpetas por interprete (primer nombre).

.DESCRIPTION
  Cada archivo de audio se mueve a una subcarpeta cuyo nombre es el PRIMER
  interprete de su tag artist. Si el tag tiene varios nombres separados por
  coma, "ft.", "feat.", "+", " x ", "/", ";" o "vs.", solo se usa el primero:

      Bad Bunny ft. Arcangel, de la ghetto, Nengo Flow -> carpeta "Bad Bunny"
      Yung Beef, Steve Lean, Kaydy Cain                 -> carpeta "Yung Beef"
      Stunna 4 Vegas + GetRichZay                       -> carpeta "Stunna 4 Vegas"

  REGLA DE UMBRAL: solo reciben carpeta propia los interpretes con MAS DE TRES
  canciones. Los interpretes con tres o menos canciones y los archivos sin tag
  artist van a la carpeta "otros" (se crea la primera vez que haga falta).

  RESPALDO POR NOMBRE DE ARCHIVO: si el artista del tag no califica para carpeta
  propia (o no hay tag), se intenta derivar el primer artista desde el NOMBRE del
  archivo (antes de " - ", " x ", " ft. ", " feat. ", " vs. ", " y ", " & ").
  Asi, "Bad Bunny X Omy De Oro X Shootter Ledo.m4a" con tag corrupto
  ("Subimos de Rango") se clasifica en la carpeta "Bad Bunny".

  Los archivos que ya estan en su carpeta correcta no se tocan (el script es
  idempotente y se puede repetir): si un interprete pasa de >3 a 3 o menos
  canciones, sus archivos se mueven a "otros"; si pasa de 3 o menos a >3, se
  sacan de "otros" a su carpeta propia. Tras mover, las carpetas de interprete
  que quedan vacias se eliminan (excluye "otros" y ".duplicados").

  Los nombres de carpeta se limpian igual que los nombres de archivo del resto
  del flujo: sin acentos y sin caracteres invalidos de Windows.

  ORDEN RECOMENDADO (PASO 4 - ultimo):
    1. normalizar-musica.ps1      (nombres + metadatos + duplicados)
    2. reparar-tags.ps1           (opcional: reparacion profunda de tags)
    3. unificar-interpretes.ps1   (unificar interpretes + nombres finales)
    4. organizar-interpretes.ps1  (ESTE: carpetas por interprete)

  La carpeta objetivo se resuelve igual que normalizar-musica.ps1:
    1. -Dir <ruta>
    2. $env:CLIP_HARBOUR_PLAYER_DIR
    3. VITE_DEFAULT_DOWNLOAD_PATH en el .env del repo
    4. %USERPROFILE%\Music\MEmu video

  Por defecto es un ENSAYO (no mueve nada). Usa -Apply para aplicar.

.PARAMETER Dir
  Ruta de la carpeta de musica a organizar.

.PARAMETER Apply
  Aplica los cambios (crea las carpetas y mueve los archivos).

.EXAMPLE
  .\organizar-interpretes.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\organizar-interpretes.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path $env:TEMP 'organizar-interpretes.log'
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
  if ($blob -match "(?m)^${field}=(.+)$") { return $Matches[1].Trim() }
  if ($blob -match "(?im)^\s*${field}\s*:\s*(.+)$") { return $Matches[1].Trim() }
  return ''
}

function Get-AudioMeta([string]$path, [string]$ff) {
  $result = [pscustomobject]@{ Artist = '' }
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
  $result.Artist = Get-FfField $raw 'artist'
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

function ConvertTo-CleanMeta([string]$s) {
  # Limpieza suave: conserva comas, guiones, &, $, parentesis.
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

function ConvertTo-SafeFolder([string]$s) {
  $invalid = [IO.Path]::GetInvalidFileNameChars()
  $n = $s
  foreach ($c in $invalid) { $n = $n.Replace([string]$c, '') }
  $n = $n -replace '\s{2,}', ' '
  return $n.Trim().TrimEnd('.').Trim()
}

function Get-FirstArtist([string]$s) {
  if (-not $s) { return '' }
  $t = ConvertTo-CleanMeta $s
  if (-not $t) { return '' }
  $parts = [regex]::Split($t, '(?i)(?:\s*,\s*|\s*;\s*|\s*\+\s*|\s*/\s*|\s*\\\s*|\s+ft\.?\s+|\s+feat\.?\s+|\s+vs\.?\s+|\s+x\s+)')
  $first = $null
  foreach ($p in $parts) {
    $p2 = $p.Trim()
    if ($p2) { $first = $p2; break }
  }
  if (-not $first) { return $t.Trim() }
  return $first
}

function Get-ArtistFolder([string]$artist) {
  if (-not $artist) { return '' }
  $a = Get-FirstArtist $artist
  $a = ConvertTo-StripAccents $a
  $a = ConvertTo-SafeFolder $a
  return $a
}

function Get-NameArtist([string]$baseName) {
  # Artista derivado del NOMBRE de archivo (respaldo cuando el tag es corrupto o
  # apunta a un recopilatorio): primer segmento antes de " - ", " x ", " ft. ",
  # " feat. ", " vs. ", " y ", " & ". Se ignoran parentesis/llaves de remix/prod.
  if (-not $baseName) { return '' }
  $t = ConvertTo-CleanMeta $baseName
  if (-not $t) { return '' }
  $t = $t -replace '[\(\[][^\)\]]*[\)\]]', ' '
  $parts = [regex]::Split($t, '(?i)(?:\s+-\s+|\s+ft\.?\s+|\s+feat\.?\s+|\s+vs\.?\s+|\s+x\s+|\s+y\s+|\s+&\s+)')
  $first = $null
  foreach ($p in $parts) {
    $p2 = $p.Trim()
    if ($p2 -and $p2 -notmatch '(?i)^(remix|version|audio|video|official|visualizer|playlist|vol\.?\s*\d+|track\s*\d+)$') {
      $first = $p2; break
    }
  }
  if (-not $first) { return $t.Trim() }
  return $first
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
  Write-Host "Aviso: no se encontro ffmpeg; sin tag artist no se puede organizar (se dejan en la raiz)."
}

$audioExt = '\.(m4a|mp3|webm|opus|ogg|aac|flac)$'
$files = @(Get-ChildItem -LiteralPath $dir -Recurse -File | Where-Object {
  $_.Extension -match $audioExt -and
  $_.FullName -notmatch '\\\.duplicados\\' -and
  $_.Name -notmatch '^__tag_' -and $_.Name -notmatch '(?i)\.temp\.'
} | Sort-Object FullName)

# --- Pasada 1: contar canciones por interprete (clave normalizada del folder). ---
# Se cuentan tanto el folder del TAG como el derivado del NOMBRE de archivo,
# para que el respaldo por nombre funcione cuando el tag es corrupto.
$fileInfo = New-Object System.Collections.Generic.List[object]
$counts = @{}
foreach ($f in $files) {
  $meta = Get-AudioMeta -path $f.FullName -ff $ff
  $folder = Get-ArtistFolder $meta.Artist
  $baseName = [IO.Path]::GetFileNameWithoutExtension($f.Name)
  $nameFolder = Get-ArtistFolder (Get-NameArtist $baseName)
  $fileInfo.Add([pscustomobject]@{
    File = $f; Folder = $folder; NameFolder = $nameFolder; Artist = $meta.Artist
  }) | Out-Null
  foreach ($cand in @($folder, $nameFolder)) {
    if ($cand) {
      $key = $cand.ToLowerInvariant()
      if ($counts.ContainsKey($key)) { $counts[$key] = $counts[$key] + 1 } else { $counts[$key] = 1 }
    }
  }
}

# --- Pasada 2: decidir destino. Solo carpeta propia si el interprete tiene >3. ---
$moves = New-Object System.Collections.Generic.List[object]
$already = 0
$noArtist = 0

foreach ($item in $fileInfo) {
  $f = $item.File
  $folder = $item.Folder
  $nameFolder = $item.NameFolder
  $targetFolder = 'otros'
  $via = 'otros'
  if ($folder) {
    $key = $folder.ToLowerInvariant()
    if ($counts[$key] -gt 3) { $targetFolder = $folder; $via = 'tag' }
  }
  if ($targetFolder -eq 'otros' -and $nameFolder) {
    $nkey = $nameFolder.ToLowerInvariant()
    if ($counts[$nkey] -gt 3) { $targetFolder = $nameFolder; $via = 'nombre' }
  }
  if ($targetFolder -eq 'otros' -and -not $folder -and -not $nameFolder) {
    $noArtist++
  }
  $destDir = Join-Path $dir $targetFolder
  $sameDir = [string]::Equals([IO.Path]::GetFullPath($f.DirectoryName), [IO.Path]::GetFullPath($destDir), [StringComparison]::OrdinalIgnoreCase)
  if ($sameDir) {
    $already++
    continue
  }
  $baseName = [IO.Path]::GetFileNameWithoutExtension($f.Name)
  $destPath = Join-Path $destDir $f.Name
  $n = 2
  while ([IO.File]::Exists($destPath) -or [IO.Directory]::Exists($destPath)) {
    $destPath = Join-Path $destDir ('{0} ({1}){2}' -f $baseName, $n, $f.Extension)
    $n++
  }
  $moves.Add([pscustomobject]@{
    Src   = $f.FullName
    Name  = $f.Name
    Folder = $targetFolder
    Dest  = $destPath
    Artist = $item.Artist
    Via    = $via
  }) | Out-Null
}

$toOtros = @($moves | Where-Object { $_.Folder -eq 'otros' }).Count

if (-not $Apply) {
  Write-Host ''
  Write-Host '== ENSAYO (no se movio nada; usa -Apply para aplicar) ==' -ForegroundColor Yellow
  Write-Host ''
  foreach ($m in $moves) {
    $suffix = if ($m.Via -eq 'nombre') { '  (via nombre de archivo)' } else { '' }
    $line = "MOVE | $($m.Name)  =>  $($m.Folder)\$([IO.Path]::GetFileName($m.Dest))$suffix"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
  Write-Host ''
  Write-Host ("Resumen: Mover={0} A_otros={1} Ya_ordenados={2} Sin_artista={3}" -f $moves.Count, $toOtros, $already, $noArtist)
  $report | Set-Content -LiteralPath $logPath -Encoding utf8
  Write-Host "Log: $logPath"
  exit 0
}

$ok = 0; $fail = 0
foreach ($m in $moves) {
  try {
    if (-not (Test-Path -LiteralPath $m.Dest -PathType Leaf)) {
      $mDestDir = Split-Path -Parent $m.Dest
      if (-not (Test-Path -LiteralPath $mDestDir -PathType Container)) {
        New-Item -ItemType Directory -Path $mDestDir | Out-Null
      }
      Move-Item -LiteralPath $m.Src -Destination $m.Dest -Force
      $ok++
      $line = "MOVED | $($m.Name)  =>  $([IO.Path]::GetFileName($mDestDir))\$([IO.Path]::GetFileName($m.Dest))"
    } else {
      $fail++
      $line = "FAIL  | $($m.Name): el destino ya existe: $($m.Dest)"
    }
    Write-Host $line
    $report.Add($line) | Out-Null
  } catch {
    $fail++
    $line = "FAIL  | $($m.Name): $($_.Exception.Message)"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
}

# Eliminar carpetas de interprete que quedaron vacias (nunca 'otros' ni .duplicados).
$emptyRemoved = 0
foreach ($d in @(Get-ChildItem -LiteralPath $dir -Directory)) {
  if ($d.Name -eq 'otros' -or $d.Name -eq '.duplicados') { continue }
  $hasFiles = @($d.GetFiles('*', [IO.SearchOption]::AllDirectories)).Count -gt 0
  if (-not $hasFiles) {
    Remove-Item -LiteralPath $d.FullName -Recurse -Force
    $emptyRemoved++
    $line = "EMPTY_DIR | $($d.Name)"
    Write-Host $line
    $report.Add($line) | Out-Null
  }
}

Write-Host ''
Write-Host ("MOVED={0} A_otros={1} EMPTY_DIR={2} FAIL={3} (ya ordenados: {4}, sin artista: {5})" -f $ok, $toOtros, $emptyRemoved, $fail, $already, $noArtist)
$report | Set-Content -LiteralPath $logPath -Encoding utf8
Write-Host "Log: $logPath"
exit 0
