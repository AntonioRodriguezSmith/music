#Requires -Version 5.1
<#
.SYNOPSIS
  Rename MEmu Music files to title-only and write clean title/artist/album tags (BMW USB).
#>
$ErrorActionPreference = 'Stop'
$dir = if ($args[0]) { $args[0] } else { Join-Path $env:USERPROFILE 'Music\MEmu Music' }
$ff = Join-Path $env:LOCALAPPDATA 'clip_harbour-target\release\ffmpeg.exe'
if (-not (Test-Path -LiteralPath $ff)) {
  $ff = Join-Path $PSScriptRoot '..\src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe'
}
if (-not (Test-Path -LiteralPath $ff)) { throw "ffmpeg not found" }
if (-not (Test-Path -LiteralPath $dir)) { throw "folder not found: $dir" }

$logPath = Join-Path $env:TEMP 'memu-bmw-retag.log'
$report = New-Object System.Collections.Generic.List[string]

$albumByTitle = @{}
foreach ($t in @(
  'nuevayol','voyallevartepapr','baileinolvidable','perfumitonuevo','weltita','velda',
  'elclub','ketutecre','bokete','kloufrens','turista','cafeconron','pitorrodecoco',
  'loquelepasoahawaii','eoo','dtmf','lamudanza'
)) { $albumByTitle[$t] = 'DeBI TiRAR MaS FOToS' }
foreach ($t in @(
  'nadiesabe','monaco','fina','hibiki','vou787','lospits','vuelvecandyb','baticano',
  'nomequierocasar','thunderylightning','achopr','alambrepua','unavelita'
)) { $albumByTitle[$t] = 'nadie sabe lo que va a pasar manana' }

function ConvertTo-NormalizedKey([string]$s) {
  if (-not $s) { return '' }
  $t = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object Text.StringBuilder
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

function Get-FfField([string]$blob, [string]$field) {
  if ($blob -match "(?m)^${field}=(.+)$") { return $Matches[1].Trim() }
  if ($blob -match "(?im)^\s*${field}\s*:\s*(.+)$") { return $Matches[1].Trim() }
  return ''
}

function Get-FileMeta([string]$path) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $raw = & $ff -hide_banner -i $path -f ffmetadata - 2>&1 | Out-String
  } finally {
    $ErrorActionPreference = $prev
  }
  [pscustomobject]@{
    Title  = Get-FfField $raw 'title'
    Artist = Get-FfField $raw 'artist'
    Album  = Get-FfField $raw 'album'
  }
}

function ConvertTo-SafeFileName([string]$name) {
  $invalid = [IO.Path]::GetInvalidFileNameChars()
  $n = $name
  foreach ($c in $invalid) { $n = $n.Replace([string]$c, '') }
  $n = $n -replace '\s{2,}', ' '
  return $n.Trim().TrimEnd('.')
}

function ConvertTo-CleanText([string]$s) {
  if (-not $s) { return '' }
  $t = $s.Trim()
  $t = $t -replace '^["“”«»]+|["“”«»]+$', ''
  $t = $t -replace '\s*\[[\w-]{11}\]\s*$', ''
  $t = $t -replace '(?i)\s*[\(\[](?:official\s*)?(?:video|audio|visualizer|lyric\s*video|music\s*video|video oficial|audio oficial|official audio|official video|video visual|short film)[^\)\]]*[\)\]]', ''
  $t = $t -replace '(?i)\s*\((?:prod\.?\s*by|produced by|shot by|video by)[^)]*\)', ''
  $t = $t -replace '(?i)\s+(?:prod\.?\s*by|produced by|shot by)\s+\S.*$', ''
  $t = $t -replace '(?i)\s+HD\s*$', ''
  $t = $t -replace '\s{2,}', ' '
  return $t.Trim()
}

function Get-SongInfo([string]$baseName, $meta) {
  $source = $baseName
  if ($meta.Title -and ($meta.Title -match '[-–—]|[|/]|\[\w{11}\]')) {
    $source = $meta.Title
  }

  $work = ConvertTo-CleanText $source
  $album = ConvertTo-CleanText $meta.Album
  $artist = ConvertTo-CleanText $meta.Artist
  $title = $work

  if ($work -match '^(?<artist>.+?)\s*[-–—]\s*(?<rest>.+)$') {
    $maybeArtist = ConvertTo-CleanText $Matches['artist']
    $rest = ConvertTo-CleanText $Matches['rest']
    if ($maybeArtist -and $rest -and $maybeArtist.Length -lt 80) {
      if (-not $artist) { $artist = $maybeArtist }
      $title = $rest
    }
  }

  if ($title -match '^(?<title>.+?)\s*[\u007C\uFF5C/]\s*(?<album>.+)$') {
    $title = ConvertTo-CleanText $Matches['title']
    if (-not $album) { $album = ConvertTo-CleanText $Matches['album'] }
  }

  $feat = ''
  if ($title -match '(?i)^(?<t>.+?)\s*\((?:ft\.?|feat\.?|featuring)\s+(?<f>[^)]+)\)\s*$') {
    $title = ConvertTo-CleanText $Matches['t']
    $feat = ConvertTo-CleanText $Matches['f']
  } elseif ($title -match '(?i)^(?<t>.+?)\s+(?:ft\.?|feat\.?|featuring)\s+(?<f>.+)$') {
    $title = ConvertTo-CleanText $Matches['t']
    $feat = ConvertTo-CleanText $Matches['f']
  }

  if ($feat) {
    if ($artist -and ($artist -notmatch [regex]::Escape($feat)) -and ($artist -notmatch '(?i)\b(ft\.?|feat\.?)\b')) {
      $artist = "$artist ft. $feat"
    } elseif (-not $artist) {
      $artist = $feat
    }
  }

  if (-not $album) {
    $key = ConvertTo-NormalizedKey $title
    if ($albumByTitle.ContainsKey($key)) { $album = $albumByTitle[$key] }
  }

  [pscustomobject]@{ Title = $title; Artist = $artist; Album = $album }
}

function Write-AudioMeta([string]$path, [string]$title, [string]$artist, [string]$album) {
  $ext = [IO.Path]::GetExtension($path)
  $tmp = Join-Path ([IO.Path]::GetDirectoryName($path)) ('__tag_' + [guid]::NewGuid().ToString('N') + $ext)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($ext -match '\.mp3$') {
      & $ff -hide_banner -y -i $path -map_metadata 0 -c copy `
        -id3v2_version 3 -write_id3v1 1 `
        -metadata "title=$title" -metadata "artist=$artist" `
        -metadata "album=$album" -metadata "album_artist=$artist" `
        $tmp 2>$null
    } else {
      & $ff -hide_banner -y -i $path -map_metadata 0 -c copy `
        -metadata "title=$title" -metadata "artist=$artist" `
        -metadata "album=$album" -metadata "album_artist=$artist" `
        $tmp 2>$null
    }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  if ($code -ne 0 -or -not (Test-Path -LiteralPath $tmp) -or ((Get-Item -LiteralPath $tmp).Length -lt 1000)) {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    throw "ffmpeg tag failed exit=$code"
  }
  Remove-Item -LiteralPath $path -Force
  Move-Item -LiteralPath $tmp -Destination $path -Force
}

function ConvertTo-M4aAudio([string]$path) {
  $out = [IO.Path]::ChangeExtension($path, '.m4a')
  if (Test-Path -LiteralPath $out) {
    Remove-Item -LiteralPath $path -Force
    return $out
  }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $ff -hide_banner -y -i $path -vn -c:a aac -b:a 256k -map_metadata 0 $out 2>$null
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  if ($code -ne 0 -or -not (Test-Path -LiteralPath $out)) {
    throw "ffmpeg convert failed for $path"
  }
  Remove-Item -LiteralPath $path -Force
  return $out
}

$files = Get-ChildItem -LiteralPath $dir -File | Where-Object {
  $_.Extension -match '\.(m4a|mp3|webm|opus|ogg|aac|flac)$' -and
  $_.Name -notmatch '^smoke_' -and
  $_.Name -notlike '__tag_*'
}

$planned = @()
foreach ($f in $files) {
  $path = $f.FullName
  if ($f.Extension -eq '.webm') {
    try {
      $path = ConvertTo-M4aAudio $f.FullName
      $f = Get-Item -LiteralPath $path
      $report.Add("CONVERT | $($f.Name)") | Out-Null
    } catch {
      $report.Add("CONVERT_FAIL | $($f.Name): $($_.Exception.Message)") | Out-Null
      continue
    }
  }

  $meta = Get-FileMeta $f.FullName
  $info = Get-SongInfo $f.BaseName $meta
  if (-not $info.Title) { continue }
  $safe = ConvertTo-SafeFileName $info.Title
  if (-not $safe) { continue }
  $planned += [pscustomobject]@{
    Path = $f.FullName
    Ext = $f.Extension
    OldName = $f.Name
    Title = $info.Title
    Artist = $info.Artist
    Album = $info.Album
    NewBase = $safe
  }
}

$used = @{}
foreach ($p in $planned) {
  $candidate = $p.NewBase
  $n = 2
  while ($used.ContainsKey(($candidate + $p.Ext).ToLowerInvariant())) {
    $candidate = '{0} ({1})' -f $p.NewBase, $n
    $n++
  }
  $used[($candidate + $p.Ext).ToLowerInvariant()] = $true
  $p | Add-Member FinalName ($candidate + $p.Ext) -Force
}

$tagged = 0; $renamed = 0; $failed = 0
foreach ($p in $planned) {
  try {
    Write-AudioMeta -path $p.Path -title $p.Title -artist $p.Artist -album $p.Album
    $tagged++
    if ($p.OldName -ne $p.FinalName) {
      $target = Join-Path $dir $p.FinalName
      if ((Test-Path -LiteralPath $target) -and ($target -ne $p.Path)) {
        throw "target exists: $($p.FinalName)"
      }
      Rename-Item -LiteralPath $p.Path -NewName $p.FinalName -Force
      $renamed++
    }
    $line = "OK | $($p.OldName) => $($p.FinalName) | t=$($p.Title) | a=$($p.Artist) | al=$($p.Album)"
    $report.Add($line) | Out-Null
    Write-Host $line
  } catch {
    $failed++
    $msg = "FAIL | $($p.OldName): $($_.Exception.Message)"
    $report.Add($msg) | Out-Null
    Write-Host $msg
  }
}

$report | Set-Content -LiteralPath $logPath -Encoding utf8
Write-Host ""
Write-Host "Tagged=$tagged Renamed=$renamed Failed=$failed"
Write-Host "Log=$logPath"
