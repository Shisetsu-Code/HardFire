$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root "plugin\HardFire"
$Dist = Join-Path $Root "dist"
$Zip = Join-Path $Dist "HardFire-Plugin.zip"

if (-not (Test-Path $Source)) {
    throw "Plugin source not found: $Source"
}

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
if (Test-Path $Zip) {
    Remove-Item $Zip -Force
}

Compress-Archive -Path (Join-Path $Source "*") -DestinationPath $Zip -CompressionLevel Optimal
Write-Host "Created $Zip"
