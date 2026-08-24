#Requires -Version 5.1
<#
.SYNOPSIS
  PASO 1 del pipeline: normaliza nombres de archivo, elimina duplicados y
  limpia los metadatos basicos de la carpeta de musica.

.DESCRIPTION
  Elimina duplicados (misma cancion y mismo artista) moviendolos a .duplicados,
  limpia los nombres dejando solo texto legible (quita emoji, simbolos, IDs de
  YouTube y marcas tipo "Official Video") y limpia los metadatos conservados:
  el titulo se escribe desde el nombre de archivo limpio y el artista/album se
  decodifican de mojibake con limpieza suave (ConvertTo-CleanMeta).

  La deduplicacion y la limpieza usan el NOMBRE DE ARCHIVO como fuente principal
  (los tags de muchos archivos descargados llegan corruptos/mojibake). El
  bitrate (ffmpeg) solo se usa para elegir cual copia duplicada se conserva.
  Dos canciones con el mismo titulo pero artistas distintos NO se consideran
  duplicadas.

  Por defecto es un ENSAYO (no toca nada). Usa -Apply para aplicar.
  Los duplicados se mueven a .duplicados; usa -DeleteDuplicates para borrarlos.

.PARAMETER Dir
  Ruta de la carpeta de musica a normalizar (se resuelve desde _lib.ps1 si se omite).

.PARAMETER Apply
  Aplica los cambios (renombra y mueve/borra duplicados).

.PARAMETER DeleteDuplicates
  Borra los duplicados en vez de moverlos a .duplicados.

.PARAMETER RemoveJunk
  Borra restos de descargas interrumpidas (*.part, *.ytdl).

.EXAMPLE
  .\01-normalizar.ps1 -Dir "C:\Users\nexux\Music\Music"

.EXAMPLE
  .\01-normalizar.ps1 -Dir "C:\Users\nexux\Music\Music" -Apply -DeleteDuplicates -RemoveJunk
#>
[CmdletBinding()]
param(
  [string]$Dir = '',
  [switch]$Apply,
  [switch]$DeleteDuplicates,
  [switch]$RemoveJunk
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_lib.ps1')
$logPath = Join-Path $env:TEMP '01-normalizar.log'
$report = New-Object System.Collections.Generic.List[string]

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

$ff = $script:Ff
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
  $meta = Get-AudioMeta -path $f.FullName -Bitrate
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

# --- Deduplicacion: misma cancion (mismo titulo normalizado y mismo artista). ---
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
