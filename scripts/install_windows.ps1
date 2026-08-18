# ==============================================================================
# NEXUS SMART HOME - WINDOWS 1-CLICK INSTALLATION SCRIPT (WITH GPU / CUDA)
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 🤖 INSTALLING NEXUS AI SMART HOME ON WINDOWS (GPU/CUDA) " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check if uv is available
$hasUv = Get-Command "uv" -ErrorAction SilentlyContinue
if (-not $hasUv) {
    Write-Host "[1/4] Installing uv package manager..." -ForegroundColor Green
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")
}

# 2. Setup Virtual Environment with Python 3.12
$projectDir = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $projectDir

Write-Host "[2/4] Setting up Python 3.12 virtual environment (.venv)..." -ForegroundColor Green
uv venv --python 3.12 .venv

# 3. Install Python Dependencies
Write-Host "[3/4] Installing dependencies from requirements.txt via uv..." -ForegroundColor Green
& "$projectDir\.venv\Scripts\python.exe" -m pip install --upgrade pip
uv pip install -r "$projectDir\requirements.txt"
uv pip install --no-deps "openwakeword>=0.6.0"

# 4. Generate Chimes and Initialize .env
Write-Host "[4/4] Generating Nexus sound effects & preparing .env..." -ForegroundColor Green
if (-not (Test-Path "$projectDir\.env")) {
    Copy-Item "$projectDir\.env.example" "$projectDir\.env"
    Write-Host "Created .env from .env.example. Please fill in your HA Token and API Key!" -ForegroundColor Magenta
}

& "$projectDir\.venv\Scripts\python.exe" "$projectDir\scripts\generate_chimes.py"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " ✅ NEXUS INSTALLATION COMPLETED ON WINDOWS!" -ForegroundColor Green
Write-Host ""
Write-Host " To start Nexus on Windows:" -ForegroundColor Yellow
Write-Host "   .\start_nexus.bat  (or: .\.venv\Scripts\python.exe main.py)" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
