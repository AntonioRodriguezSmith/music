# ===================================================
# CONFIGURACIONES EDITABLES
# ===================================================

# Formato de mayusculas deseado:
# "Oracion"  -> Solo la PRIMERA letra del titulo en mayuscula (ej: Titi me pregunto)
# "Titulo"   -> Cada PALABRA del titulo con mayuscula (ej: Titi Me Pregunto)
# "Minusculas" -> Todo en minusculas (ej: titi me pregunto)
$formato = "Oracion"

# ¿Quitar los acentos (tildes)? Pon $true para SI, o $false para NO
$removerAcentos = $true

# ¿Buscar el álbum en MusicBrainz si está vacío? Pon $true para SI, o $false para NO
$buscarAlbumEnWeb = $true

# ===================================================
# FUNCIONES
# ===================================================

function Formatear-Titulo {
    param([string]$texto)
    if ([string]::IsNullOrWhiteSpace($texto)) { return "" }
    $texto = $texto.ToLower()
    if ($formato -eq "Oracion") {
        if ($texto.Length -gt 0) {
            $texto = $texto.Substring(0,1).ToUpper() + $texto.Substring(1)
        }
    } elseif ($formato -eq "Titulo") {
        $texto = (Get-Culture).TextInfo.ToTitleCase($texto)
    }
    # Capitalizar dentro de paréntesis
    $texto = [regex]::Replace($texto, '\(([^)]*)\)', {
        $contenido = $args[0].Groups[1].Value
        $contenidoFormateado = (Get-Culture).TextInfo.ToTitleCase($contenido)
        return "($contenidoFormateado)"
    })
    if ($removerAcentos) {
        $texto = $texto.Normalize([System.Text.NormalizationForm]::FormD)
        $texto = $texto -replace '\p{M}', ''
    }
    return $texto
}

function Buscar-AlbumEnMusicBrainz {
    param([string]$artista, [string]$cancion)
    $artistaLimpio = $artista -replace '[^\p{L}\p{N}\s]', ''
    $cancionLimpia = $cancion -replace '[^\p{L}\p{N}\s]', ''
    if ([string]::IsNullOrWhiteSpace($artistaLimpio) -or [string]::IsNullOrWhiteSpace($cancionLimpia)) {
        return $null
    }
    $query = "artist:`"$artistaLimpio`" AND recording:`"$cancionLimpia`""
    $url = "https://musicbrainz.org/ws/2/recording/?query=$([uri]::EscapeDataString($query))&fmt=json&limit=1"
    Write-Host "      Buscando album en MusicBrainz para: $artistaLimpio - $cancionLimpia" -ForegroundColor Gray
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -UserAgent "PowerShell Script/1.0 (rodrigo@example.com)" -ErrorAction Stop
        if ($response.recordings -and $response.recordings.Count -gt 0) {
            $grabacion = $response.recordings[0]
            if ($grabacion.releases -and $grabacion.releases.Count -gt 0) {
                $album = $grabacion.releases[0].title
                Write-Host "      Album encontrado: $album" -ForegroundColor Green
                return $album
            }
        }
    } catch {
        Write-Host "      No se pudo buscar en MusicBrainz (posible límite de tasa)" -ForegroundColor Yellow
    }
    return $null
}

# Leer metadatos con WMP COM (solo MP3/WMA)
function Get-MediaMetadata {
    param([string]$rutaArchivo)
    $shell = New-Object -ComObject Shell.Application
    $folder = Split-Path $rutaArchivo
    $file = Split-Path $rutaArchivo -Leaf
    $shellFolder = $shell.Namespace($folder)
    $shellFile = $shellFolder.ParseName($file)
    $propiedades = @{}
    $propiedades.Title = $shellFolder.GetDetailsOf($shellFile, 21)
    $propiedades.Artist = $shellFolder.GetDetailsOf($shellFile, 20)
    $propiedades.Album = $shellFolder.GetDetailsOf($shellFile, 14)
    return $propiedades
}

# Escribir metadatos con WMP COM
function Set-MediaMetadata {
    param([string]$rutaArchivo, [string]$titulo, [string]$artista, [string]$album)
    try {
        $wmp = New-Object -ComObject WMPlayer.OCX
        $media = $wmp.newMedia($rutaArchivo)
        if ($media) {
            if ($titulo) { $media.setItemInfo("Title", $titulo) }
            if ($artista) { $media.setItemInfo("Artist", $artista) }
            if ($album) { $media.setItemInfo("Album", $album) }
            $media = $null
        }
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wmp) | Out-Null
    } catch {
        Write-Host "      Error al escribir metadatos con WMP: $_" -ForegroundColor Red
    }
}

# ===================================================
# INICIO DEL SCRIPT
# ===================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RENOMBRADOR Y LIMPIADOR DE METADATOS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Pedir ruta
do {
    $ruta = Read-Host -Prompt "`nEscribe la ruta de la carpeta (ej: C:\Users\rodri\Music\MEmu Music)"
    $ruta = $ruta.Trim('"').Trim("'")
    if (-not (Test-Path $ruta)) {
        Write-Host "ERROR: La ruta '$ruta' no existe. Intenta de nuevo." -ForegroundColor Red
        $rutaValida = $false
    } else {
        $rutaValida = $true
    }
} while (-not $rutaValida)

# Filtrar solo archivos MP3 y WMA
$archivos = Get-ChildItem -Path $ruta -File | Where-Object { $_.Extension -match '\.mp3|\.wma' }
if ($archivos.Count -eq 0) {
    Write-Host "No hay archivos MP3 o WMA en la carpeta. Saliendo..." -ForegroundColor Red
    exit
}

Write-Host "`nProcesando archivos en: $ruta" -ForegroundColor Gray
Write-Host "Formato: $formato | Sin acentos: $removerAcentos | Buscar album: $buscarAlbumEnWeb" -ForegroundColor Gray
Write-Host "`n--- PASO 1: VISTA PREVIA DE CAMBIOS ---" -ForegroundColor Cyan

$listaCambios = @()
$contadorCambios = 0
$albumesBuscados = 0
$albumesEncontrados = 0

foreach ($archivo in $archivos) {
    $nombreOriginal = $archivo.Name
    $base = $archivo.BaseName
    $extension = $archivo.Extension

    # Extraer partes del nombre
    $artistaExtraido = ""
    $albumExtraido = ""
    $cancionExtraida = ""
    if ($base -match ' - ') {
        $partes = $base -split ' - '
        if ($partes.Count -eq 2) {
            $artistaExtraido = $partes[0].Trim()
            $cancionExtraida = $partes[1].Trim()
        } elseif ($partes.Count -ge 3) {
            $artistaExtraido = $partes[0].Trim()
            $albumExtraido = $partes[1].Trim()
            $cancionExtraida = ($partes[2..($partes.Count-1)] -join ' - ').Trim()
        }
    } else {
        $cancionExtraida = $base.Trim()
    }

    # Limpiar y formatear
    $artistaLimpio = Formatear-Titulo -texto $artistaExtraido
    $albumLimpio = Formatear-Titulo -texto $albumExtraido
    $cancionLimpia = Formatear-Titulo -texto $cancionExtraida
    if ([string]::IsNullOrWhiteSpace($cancionLimpia)) {
        $cancionLimpia = $base -replace '[^\p{L}\p{N}\s\-_.()]', ''
        $cancionLimpia = Formatear-Titulo -texto $cancionLimpia
        if ([string]::IsNullOrWhiteSpace($cancionLimpia)) { $cancionLimpia = "sin_titulo" }
    }

    # Leer metadatos actuales
    $metadatos = Get-MediaMetadata -rutaArchivo $archivo.FullName
    $albumActual = $metadatos.Album
    $artistaActual = $metadatos.Artist
    $tituloActual = $metadatos.Title

    # Determinar álbum final
    $albumFinal = ""
    if (-not [string]::IsNullOrWhiteSpace($albumActual)) {
        $albumFinal = $albumActual
    } elseif (-not [string]::IsNullOrWhiteSpace($albumLimpio)) {
        $albumFinal = $albumLimpio
    } elseif ($buscarAlbumEnWeb -and -not [string]::IsNullOrWhiteSpace($artistaLimpio) -and -not [string]::IsNullOrWhiteSpace($cancionLimpia)) {
        $albumesBuscados++
        $albumBuscado = Buscar-AlbumEnMusicBrainz -artista $artistaLimpio -cancion $cancionLimpia
        if ($albumBuscado) {
            $albumFinal = $albumBuscado
            $albumesEncontrados++
        }
    }
    if ([string]::IsNullOrWhiteSpace($albumFinal)) { $albumFinal = "" }

    # Verificar cambios en metadatos
    $cambiaMetadatos = $false
    if (-not [string]::IsNullOrWhiteSpace($artistaLimpio) -and $artistaActual -ne $artistaLimpio) { $cambiaMetadatos = $true }
    if (-not [string]::IsNullOrWhiteSpace($albumFinal) -and $albumActual -ne $albumFinal) { $cambiaMetadatos = $true }
    if (-not [string]::IsNullOrWhiteSpace($cancionLimpia) -and $tituloActual -ne $cancionLimpia) { $cambiaMetadatos = $true }

    # Nuevo nombre (solo la canción)
    $nuevoNombre = $cancionLimpia + $extension
    $nombreFinal = $nuevoNombre
    $i = 1
    while (Test-Path (Join-Path $ruta $nombreFinal)) {
        $nombreFinal = "$cancionLimpia ($i)$extension"
        $i++
    }
    $cambiaNombre = ($nombreOriginal -ne $nombreFinal)

    # Guardar en lista
    $listaCambios += [PSCustomObject]@{
        RutaCompleta    = $archivo.FullName
        NombreOriginal  = $nombreOriginal
        NombreFinal     = $nombreFinal
        ArtistaNuevo    = $artistaLimpio
        AlbumNuevo      = $albumFinal
        TituloNuevo     = $cancionLimpia
        CambiaNombre    = $cambiaNombre
        CambiaMetadatos = $cambiaMetadatos
        AlbumBuscadoWeb = ($buscarAlbumEnWeb -and -not [string]::IsNullOrWhiteSpace($albumFinal) -and [string]::IsNullOrWhiteSpace($albumActual) -and [string]::IsNullOrWhiteSpace($albumLimpio))
    }

    # Mostrar vista previa
    if ($cambiaNombre -or $cambiaMetadatos) {
        $contadorCambios++
        Write-Host ""
        Write-Host "[$contadorCambios] ARCHIVO: $nombreOriginal" -ForegroundColor Yellow
        if ($cambiaNombre) {
            Write-Host "    NUEVO NOMBRE: $nombreFinal" -ForegroundColor Green
        }
        if ($cambiaMetadatos) {
            Write-Host "    METADATOS NUEVOS:" -ForegroundColor Cyan
            if (-not [string]::IsNullOrWhiteSpace($artistaLimpio)) { Write-Host "      Artista: $artistaLimpio" -ForegroundColor Cyan }
            if (-not [string]::IsNullOrWhiteSpace($albumFinal)) {
                Write-Host "      Album: $albumFinal" -ForegroundColor Cyan
                if ($listaCambios[-1].AlbumBuscadoWeb) { Write-Host "      (Album obtenido de MusicBrainz)" -ForegroundColor Magenta }
            }
            Write-Host "      Titulo: $cancionLimpia" -ForegroundColor Cyan
        }
        Write-Host "    ------------------------------------" -ForegroundColor Gray
    } else {
        Write-Host "[*] SIN CAMBIOS: $nombreOriginal" -ForegroundColor Gray
    }
}

# Resumen de la vista previa
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Total de archivos procesados: $($archivos.Count)" -ForegroundColor White
Write-Host "Archivos con cambios pendientes: $contadorCambios" -ForegroundColor Green
if ($buscarAlbumEnWeb) {
    Write-Host "Albumes buscados en MusicBrainz: $albumesBuscados" -ForegroundColor Gray
    Write-Host "Albumes encontrados: $albumesEncontrados" -ForegroundColor Green
}
Write-Host "========================================" -ForegroundColor Cyan

if ($contadorCambios -eq 0) {
    Write-Host "`nNo hay cambios pendientes. Saliendo..." -ForegroundColor Gray
    exit
}

# Confirmación
$respuesta = Read-Host -Prompt "`n¿Deseas APLICAR estos cambios a los $contadorCambios archivos? (S/N)"
if ($respuesta -ne "S" -and $respuesta -ne "s") {
    Write-Host "Operación cancelada por el usuario. No se realizaron cambios." -ForegroundColor Yellow
    exit
}

# ===================================================
# APLICAR CAMBIOS
# ===================================================

Write-Host "`n--- PASO 2: APLICANDO CAMBIOS ---" -ForegroundColor Cyan
$aplicados = 0
$erroresAplicacion = 0

foreach ($cambio in $listaCambios) {
    if (-not $cambio.CambiaNombre -and -not $cambio.CambiaMetadatos) { continue }
    try {
        if ($cambio.CambiaMetadatos) {
            Set-MediaMetadata -rutaArchivo $cambio.RutaCompleta -titulo $cambio.TituloNuevo -artista $cambio.ArtistaNuevo -album $cambio.AlbumNuevo
            Write-Host "  [OK] Metadatos actualizados: $($cambio.NombreOriginal)" -ForegroundColor Green
        }
        if ($cambio.CambiaNombre) {
            Rename-Item -Path $cambio.RutaCompleta -NewName $cambio.NombreFinal
            Write-Host "  [OK] Renombrado: $($cambio.NombreOriginal) -> $($cambio.NombreFinal)" -ForegroundColor Green
        }
        $aplicados++
    } catch {
        $erroresAplicacion++
        Write-Host "  [ERROR] No se pudo aplicar cambios a: $($cambio.NombreOriginal)" -ForegroundColor Red
        Write-Host "         $_" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PROCESO COMPLETADO" -ForegroundColor White
Write-Host "Cambios aplicados correctamente: $aplicados" -ForegroundColor Green
if ($erroresAplicacion -gt 0) { Write-Host "Errores durante la aplicación: $erroresAplicacion" -ForegroundColor Red }
Write-Host "========================================" -ForegroundColor Cyan