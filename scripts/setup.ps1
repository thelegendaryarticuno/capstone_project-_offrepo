<#
.SYNOPSIS
  One-shot local setup for SPRPA: Python venv + packages for the ML service, npm packages for
  backend and frontend, model download, and .env check. Optionally starts all three servers.

.EXAMPLE
  .\scripts\setup.ps1            # set everything up
  .\scripts\setup.ps1 -Start     # set up, then open the 3 servers in their own windows
  .\scripts\setup.ps1 -SkipModels
#>
param(
  [switch]$Start,
  [switch]$SkipModels
)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot\.."
$App  = Join-Path $Root "application"
$Ml   = Join-Path $App "ml-service"
$Venv = Join-Path $Ml ".venv"
$VenvPy = Join-Path $Venv "Scripts\python.exe"

function Step($n, $msg) { Write-Host "`n[$n/6] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Need($cmd, $hint) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fail "$cmd not found. $hint" } }

# 1. Tooling
Step 1 "Checking Node.js and Python"
Need node "Install Node.js 22.13+ (24 LTS recommended) from https://nodejs.org"
Need npm  "npm ships with Node.js"
$nodeVer = [version]((node -v).TrimStart("v"))
if ($nodeVer -lt [version]"22.13.0") { Fail "Node $nodeVer is too old: the backend uses node:sqlite (needs 22.13+)." }
$py = if (Get-Command py -ErrorAction SilentlyContinue) { "py" } elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { Fail "Python 3.10+ not found. Install it from https://python.org" }
$pyVer = [version](& $py -c "import sys;print('%d.%d' % sys.version_info[:2])")
if ($pyVer -lt [version]"3.10") { Fail "Python $pyVer is too old (need 3.10+)." }
Write-Host "  node $nodeVer, python $pyVer"

# 2. Python venv for the ML service
Step 2 "Creating Python venv and installing ML packages (torch + transformers can take a few minutes)"
if (-not (Test-Path $VenvPy)) { & $py -m venv $Venv; if ($LASTEXITCODE) { Fail "venv creation failed" } }
& $VenvPy -m pip install --quiet --upgrade pip
& $VenvPy -m pip install --quiet -r (Join-Path $Ml "requirements.txt")
if ($LASTEXITCODE) { Fail "pip install failed" }
& $VenvPy -m pip install --quiet pytest httpx
Write-Host "  venv ready: $Venv"

# 3. Node packages
Step 3 "Installing backend and frontend packages"
foreach ($dir in "backend", "frontend") {
  Push-Location (Join-Path $App $dir)
  try { npm ci --no-audit --no-fund --loglevel=error; if ($LASTEXITCODE) { Fail "npm ci failed in $dir" } } finally { Pop-Location }
  Write-Host "  $dir ok"
}

# 4. Models
Step 4 "Fetching trained models"
if ($SkipModels) { Write-Host "  skipped (-SkipModels); the ML service will report the models as not connected" }
else { & (Join-Path $PSScriptRoot "fetch-models.ps1") -Root $Root }

# 5. Config and secrets
Step 5 "Checking .env and Firebase service account"
$envFile = Join-Path $App ".env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $App ".env.example") $envFile
  Write-Host "  created application\.env from .env.example: fill in the Firebase values" -ForegroundColor Yellow
}
$sa = (Get-Content $envFile | Where-Object { $_ -match '^FIREBASE_SA_FILE=' }) -replace '^FIREBASE_SA_FILE=', ''
if (-not $sa) { $sa = "secrets/sprpa-87334-firebase-adminsdk-fbsvc-71f06c7a4a.json" }
if (Test-Path (Join-Path $App $sa)) { Write-Host "  service account found: $sa" }
else { Write-Host "  service account missing: put the Firebase admin JSON at application\$sa (never commit it)" -ForegroundColor Yellow }

# 6. Done / start
Step 6 "Done"
$cmds = @(
  @{ name = "SPRPA ML :8000";       dir = $Ml;                         cmd = "& '$VenvPy' -m uvicorn main:app --port 8000" },
  @{ name = "SPRPA backend :4000";  dir = (Join-Path $App "backend");  cmd = "npm run dev" },
  @{ name = "SPRPA frontend :5173"; dir = (Join-Path $App "frontend"); cmd = "npm run dev" }
)
if ($Start) {
  foreach ($c in $cmds) {
    Start-Process powershell -WorkingDirectory $c.dir -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='$($c.name)'; $($c.cmd)"
  }
  Write-Host "  started 3 servers in new windows. Open http://localhost:5173 (ML models take ~25 s to load)." -ForegroundColor Green
} else {
  Write-Host "  Run each in its own terminal (or rerun with -Start):"
  foreach ($c in $cmds) { Write-Host "    cd '$($c.dir)'; $($c.cmd)" }
}
