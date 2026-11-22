# Gera dist\module.zip e dist\module.json para publicar uma release no GitHub.
# Uso: powershell -File .\build-release.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = $PSScriptRoot
$dist = Join-Path $root "dist"
$include = @("module.json", "README.md", "lang", "scripts", "styles", "templates")

if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory $dist | Out-Null

$zipPath = Join-Path $dist "module.zip"
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, "Create")
try {
    foreach ($item in $include) {
        $full = Join-Path $root $item
        $files = if (Test-Path $full -PathType Container) { Get-ChildItem $full -Recurse -File } else { Get-Item $full }
        foreach ($f in $files) {
            # Caminhos com "/" para funcionar em servidores Linux (Forge etc.)
            $entry = $f.FullName.Substring($root.Length + 1).Replace("\", "/")
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entry) | Out-Null
        }
    }
} finally {
    $zip.Dispose()
}

Copy-Item (Join-Path $root "module.json") (Join-Path $dist "module.json")
$version = (Get-Content (Join-Path $root "module.json") -Raw | ConvertFrom-Json).version
Write-Output "Versao $version -> $zipPath"
