<#
.SYNOPSIS
  Downloads the SPRPA model files listed in application/ml-service/models/manifest.json
  from the GitHub release and verifies their SHA-256.

.DESCRIPTION
  Files that are already present with the right hash are skipped. With -CacheDir, verified files
  are kept in (and reused from) a shared folder, so CI only downloads each model version once.

.EXAMPLE
  .\scripts\fetch-models.ps1
  .\scripts\fetch-models.ps1 -CacheDir C:\ProgramData\Jenkins\sprpa-models-cache
#>
param(
  [string]$Root = (Resolve-Path "$PSScriptRoot\.."),
  [string]$CacheDir = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is ~10x faster without the progress bar
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$modelDir = Join-Path $Root "application\ml-service\models"
$manifest = Get-Content (Join-Path $modelDir "manifest.json") -Raw | ConvertFrom-Json
$base = "https://github.com/$($manifest.repo)/releases/download/$($manifest.release)"
if ($CacheDir) { New-Item -ItemType Directory -Force $CacheDir | Out-Null }

function Test-Hash([string]$path, [string]$sha) {
  (Test-Path $path) -and ((Get-FileHash $path -Algorithm SHA256).Hash -ieq $sha)
}

foreach ($f in $manifest.files) {
  $dest = Join-Path $modelDir $f.name
  $mb = [math]::Round($f.bytes / 1MB, 1)
  if (Test-Hash $dest $f.sha256) { Write-Host "  ok      $($f.name) ($mb MB, already present)"; continue }

  $cached = if ($CacheDir) { Join-Path $CacheDir "$($f.sha256).joblib" } else { "" }
  if ($cached -and (Test-Hash $cached $f.sha256)) {
    Copy-Item $cached $dest -Force
    Write-Host "  cache   $($f.name) ($mb MB)"
    continue
  }

  Write-Host "  fetch   $($f.name) ($mb MB) from $($manifest.release) ..."
  $tmp = "$dest.part"
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$($f.name)" -OutFile $tmp
  if (-not (Test-Hash $tmp $f.sha256)) {
    Remove-Item $tmp -Force
    throw "SHA-256 mismatch for $($f.name): download corrupted or release changed"
  }
  Move-Item $tmp $dest -Force
  if ($cached) { Copy-Item $dest $cached -Force }
  Write-Host "  ok      $($f.name) verified"
}
Write-Host "Models ready in $modelDir"
