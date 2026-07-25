# Filter / merge Netscape cookies for Clip Harbour (YouTube + Google only).
# Drops empty values and writes UTF-8 **without BOM** (yt-dlp rejects UTF-8 BOM).
#
# Filter one file:
#   .\scripts\filter-youtube-cookies.ps1 -InputPath "...\cookies_edge.txt"
#
# Merge several (dedupe domain+path+name):
#   .\scripts\filter-youtube-cookies.ps1 -InputPath @(
#     "...\cookies_edge.bak.txt", "...\cookies_chrome.bak.txt"
#   ) -OutputPath "...\cookies_merged.txt"

param(
  [Parameter(Mandatory = $true)]
  [string[]]$InputPath,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

function Test-YoutubeDomain([string]$domain) {
  return ($domain -match '(?i)youtube') -or ($domain -match '(?i)google') -or
    ($domain -match '(?i)googlevideo') -or ($domain -match '(?i)ytimg') -or
    ($domain -match '(?i)ggpht') -or ($domain -match '(?i)gstatic')
}

function Write-Utf8NoBom([string]$path, [string[]]$lines) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($path, $lines, $utf8)
}

# Map key -> @{ line; expiry }
$byKey = @{}
$skippedEmpty = 0
$skippedOther = 0
$read = 0

foreach ($path in $InputPath) {
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Error "File not found: $path"
  }
  Get-Content -LiteralPath $path | ForEach-Object {
    $line = $_
    if ([string]::IsNullOrWhiteSpace($line)) { return }
    # Strip BOM if present on first line
    if ($line.Length -gt 0 -and [int][char]$line[0] -eq 0xFEFF) {
      $line = $line.Substring(1)
    }
    if ($line.TrimStart().StartsWith("#")) { return }

    $parts = $line -split "`t", 7
    if ($parts.Count -lt 7) {
      $skippedOther++
      return
    }

    $domain = $parts[0].Trim()
    $flag = $parts[1].Trim().ToUpperInvariant()
    $pathPart = $parts[2]
    $secure = $parts[3].Trim().ToUpperInvariant()
    $name = $parts[5]
    $value = $parts[6]
    $expiry = 0L
    [void][long]::TryParse($parts[4], [ref]$expiry)

    if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($value)) {
      $skippedEmpty++
      return
    }
    if (-not (Test-YoutubeDomain $domain)) {
      $skippedOther++
      return
    }

    # Netscape / yt-dlp: leading "." on domain requires flag TRUE.
    if ($domain.StartsWith(".")) {
      $flag = "TRUE"
    } elseif ($flag -ne "TRUE" -and $flag -ne "FALSE") {
      $flag = "FALSE"
    }
    if ($secure -ne "TRUE" -and $secure -ne "FALSE") {
      $secure = "FALSE"
    }
    $parts[1] = $flag
    $parts[3] = $secure

    $read++
    $key = "$domain`t$pathPart`t$name"
    $normalized = ($parts -join "`t")
    if (-not $byKey.ContainsKey($key)) {
      $byKey[$key] = @{ line = $normalized; expiry = $expiry }
    } else {
      # Prefer later expiry / keep existing if equal
      if ($expiry -ge [long]$byKey[$key].expiry) {
        $byKey[$key] = @{ line = $normalized; expiry = $expiry }
      }
    }
  }
}

if ($byKey.Count -eq 0) {
  Write-Error "No YouTube/Google cookies kept. Re-export after logging into YouTube."
}

if (-not $OutputPath) {
  if ($InputPath.Count -eq 1) {
    $dir = Split-Path -Parent $InputPath[0]
    $OutputPath = Join-Path $dir "cookies_youtube_only.txt"
  } else {
    $dir = Split-Path -Parent $InputPath[0]
    $OutputPath = Join-Path $dir "cookies_merged.txt"
  }
}

$out = New-Object System.Collections.Generic.List[string]
$out.Add("# Netscape HTTP Cookie File") | Out-Null
$out.Add("# Filtered/merged for Clip Harbour / yt-dlp (YouTube + Google). UTF-8 no BOM.") | Out-Null
$out.Add("# Sources: $($InputPath -join '; ')") | Out-Null
foreach ($entry in ($byKey.Values | Sort-Object { $_.line })) {
  $out.Add($entry.line) | Out-Null
}

Write-Utf8NoBom $OutputPath $out.ToArray()
Write-Host "Wrote $OutputPath"
Write-Host "Unique cookies: $($byKey.Count)  (raw kept rows seen: $read)"
Write-Host "Skipped empty name/value: $skippedEmpty  skipped other domains/bad lines: $skippedOther"
Write-Host "In Clip Harbour: sidebar → Elegir cookies.txt → this file."
