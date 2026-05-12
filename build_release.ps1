# Build Release Script for Modern Filer

Write-Host "--- Starting Release Build ---" -ForegroundColor Cyan

# 1. Build C Server
Write-Host "[1/3] Building C Server..." -ForegroundColor Yellow
$makeCmd = ""
if (Get-Command make -ErrorAction SilentlyContinue) { $makeCmd = "make" }
elseif (Get-Command mingw32-make -ErrorAction SilentlyContinue) { $makeCmd = "mingw32-make" }

if ($makeCmd -ne "") {
    & $makeCmd clean
    & $makeCmd
} else {
    Write-Error "make command not found. Please ensure you have a C compiler and make installed."
    exit 1
}

if (-not (Test-Path "filer_server.exe")) {
    Write-Error "Failed to build filer_server.exe"
    exit 1
}

# 2. Build Frontend
Write-Host "[2/3] Building Frontend..." -ForegroundColor Yellow
Set-Location frontend

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules not found, running npm install..."
    npm install
}

npm run build

# 3. Finish
Write-Host "[3/3] Build Complete!" -ForegroundColor Green
Write-Host "Release files are located in: frontend\dist\" -ForegroundColor Cyan

Set-Location ..
