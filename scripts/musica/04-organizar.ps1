#Requires -Version 5.1
<#
.SYNOPSIS
  PASO 4 del pipeline: organiza las canciones en carpetas por interprete
  (primer nombre).

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
  del flujo: sin acentos y sin caracteres invalidos de Windows, y se normalizan
  a Titulo Capitalizado (p.ej. "Tali Goya") para que variantes de caja del mismo
  artista (TALI, Tali, TALI GOYA) converjan en una sola carpeta. Si ya existe
  una carpeta con el mismo nombre (sin distincion de mayusculas), se adopta su
  nombre real (p.ej. "DAPS").

  Si dos archivos con el mismo nombre caen en la misma carpeta destino (p.ej.
  una copia en la raiz y otra en "otros"), el segundo se mueve como
  "Nombre (2).ext" en vez de fallar con "destino ya existe".

  Por defecto es un ENSAYO (no mueve nada). Usa -Apply para aplicar.

.PARAMETER Dir
  Ruta de la carpeta de musica a organizar (se resuelve desde _lib.ps1 si se omite).

.PARAMETER Apply
  Aplica los cambios (crea las carpetas y mueve los archivos).

.EXAMPLE
  .\04-organizar.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\04-organizar.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_lib.ps1')
$logPath = Join-Path $env:TEMP '04-organizar.log'
$report = New-Object System.Collections.Generic.List[string]

function ConvertTo-SafeFolder([string]$s) {
  $invalid = [IO.Path]::GetInvalidFileNameChars()
  $n = $s
  foreach ($c in $invalid) { $n = $n.Replace([string]$c, '') }
  $n = $n -replace '\s{2,}', ' '
  return $n.Trim().TrimEnd('.').Trim()
}

function ConvertTo-TitleCase([string]$s) {
  # Normaliza la caja del nombre de carpeta para que variantes del mismo artista
  # (TALI, Tali, TALI GOYA) converjan en una sola (Tali, Tali Goya).
  if (-not $s) { return $s }
  $ci = [Globalization.CultureInfo]'en-US'
  return $ci.TextInfo.ToTitleCase($s.ToLowerInvariant())
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
  $a = ConvertTo-TitleCase $a
  $a = ConvertTo-SafeFolder $a
  return $a
}

function Resolve-ExistingFolder([string]$dir, [string]$name) {
  # Si ya existe una carpeta con ese nombre (comparacion sin distincion de
  # mayusculas), adopta su nombre real para no duplicarla (p.ej. "DAPS").
  $match = Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ieq $name } | Select-Object -First 1
  if ($match) { return $match.Name }
  return $name
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

$ff = $script:Ff
if ($ff) {
  Write-Host "ffmpeg: $ff"
} else {
  Write-Host "Aviso: no se encontro ffmpeg; sin tag artist no se puede organizar (se dejan en la raiz)."
}

$files = Get-MusicFiles $dir

# --- Pasada 1: contar canciones por interprete (clave normalizada del folder). ---
# Se cuentan tanto el folder del TAG como el derivado del NOMBRE de archivo,
# para que el respaldo por nombre funcione cuando el tag es corrupto.
$fileInfo = New-Object System.Collections.Generic.List[object]
$counts = @{}
foreach ($f in $files) {
  $meta = Get-AudioMeta -path $f.FullName
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
$claimed = @{}

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
  # Adopta el nombre real de una carpeta ya existente para no duplicarla.
  $targetFolder = Resolve-ExistingFolder $dir $targetFolder
  $destDir = Join-Path $dir $targetFolder
  $sameDir = [string]::Equals([IO.Path]::GetFullPath($f.DirectoryName), [IO.Path]::GetFullPath($destDir), [StringComparison]::OrdinalIgnoreCase)
  if ($sameDir) {
    $already++
    continue
  }
  $baseName = [IO.Path]::GetFileNameWithoutExtension($f.Name)
  $destPath = Join-Path $destDir $f.Name
  $n = 2
  while ([IO.File]::Exists($destPath) -or [IO.Directory]::Exists($destPath) -or $claimed.ContainsKey($destPath.ToLowerInvariant())) {
    $destPath = Join-Path $destDir ('{0} ({1}){2}' -f $baseName, $n, $f.Extension)
    $n++
  }
  $claimed[$destPath.ToLowerInvariant()] = $true
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
