# Envia os arquivos do módulo para o repositório no GitHub (sem git, via GitHub CLI).
# Só envia o que mudou. Uso: powershell -File .\publish-files.ps1 -Version 0.4
param([Parameter(Mandatory)][string]$Version)
$ErrorActionPreference = "Stop"
$gh = "C:\Program Files\GitHub CLI\gh.exe"
$repo = "lokirj/npc-quote"
$root = $PSScriptRoot
$include = @(".gitignore", "module.json", "README.md", "build-release.ps1", "publish-files.ps1", "lang", "scripts", "styles", "templates")
$tmp = Join-Path $env:TEMP "npcq-upload.json"

# SHA (formato git blob) de cada arquivo que já está no repositório
$remote = @{}
$tree = & $gh api "repos/$repo/git/trees/HEAD?recursive=1" | ConvertFrom-Json
foreach ($t in $tree.tree) { if ($t.type -eq "blob") { $remote[$t.path] = $t.sha } }

function Get-BlobSha([byte[]]$bytes) {
    $header = [Text.Encoding]::ASCII.GetBytes("blob $($bytes.Length)`0")
    $sha1 = [Security.Cryptography.SHA1]::Create()
    -join ($sha1.ComputeHash([byte[]]($header + $bytes)) | ForEach-Object { $_.ToString("x2") })
}

foreach ($item in $include) {
    $full = Join-Path $root $item
    $files = if (Test-Path $full -PathType Container) { Get-ChildItem $full -Recurse -File } else { Get-Item -Force $full }
    foreach ($f in $files) {
        $path = $f.FullName.Substring($root.Length + 1).Replace("\", "/")
        $bytes = [IO.File]::ReadAllBytes($f.FullName)
        $sha = $remote[$path]
        if ($sha -and ($sha -eq (Get-BlobSha $bytes))) { continue }
        $body = @{ message = "v${Version}: atualiza $path"; content = [Convert]::ToBase64String($bytes) }
        if ($sha) { $body.sha = $sha }
        $body | ConvertTo-Json -Compress | Set-Content -Encoding ascii $tmp
        & $gh api -X PUT "repos/$repo/contents/$path" --input $tmp --jq .content.path
        if ($LASTEXITCODE -ne 0) { throw "upload falhou: $path" }
    }
}
if (Test-Path $tmp) { Remove-Item $tmp }
