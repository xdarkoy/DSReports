# Builds the React webview bundle and copies it into the Visual Studio
# extension's Resources\webview folder so the VSIX ships the current designer.
#
#   pwsh scripts/build-webview.ps1
#
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
    npm run build:webview --workspace apps/vscode-extension

    $media = Join-Path $root "apps/vscode-extension/media"
    $dest = Join-Path $root "extensions/visualstudio/Resources/webview"
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item (Join-Path $media "designer.js") $dest -Force
    Copy-Item (Join-Path $media "designer.css") $dest -Force
    Write-Host "Webview assets copied to $dest"
}
finally {
    Pop-Location
}
