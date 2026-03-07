# dev.ps1 — Cross-platform dev commands for Windows
# Usage:  .\dev.ps1 install | dev | backend | frontend | health | clean | help

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

function Install {
    Write-Host "==> Installing backend dependencies..." -ForegroundColor Cyan
    Push-Location backend
    if (-not (Test-Path "venv")) {
        python -m venv venv
    }
    .\venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    Pop-Location

    Write-Host "==> Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location frontend
    npm install
    Pop-Location

    Write-Host "==> Done!" -ForegroundColor Green
}

function Start-Backend {
    Write-Host "==> Starting backend..." -ForegroundColor Cyan
    Push-Location backend
    .\venv\Scripts\Activate.ps1
    uvicorn app.main:app --reload --port 8080 --reload-exclude "venv/*"
    Pop-Location
}

function Start-Frontend {
    Write-Host "==> Starting frontend..." -ForegroundColor Cyan
    Push-Location frontend
    npm run dev
    Pop-Location
}

function Start-Dev {
    Write-Host "==> Starting backend and frontend..." -ForegroundColor Cyan
    Write-Host "    Open TWO terminals and run:" -ForegroundColor Yellow
    Write-Host "      Terminal 1:  .\dev.ps1 backend" -ForegroundColor White
    Write-Host "      Terminal 2:  .\dev.ps1 frontend" -ForegroundColor White
    Write-Host ""
    Write-Host "    Or start both in background jobs:" -ForegroundColor Yellow

    $backendJob = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        Push-Location backend
        .\venv\Scripts\Activate.ps1
        uvicorn app.main:app --reload --port 8080 --reload-exclude "venv/*"
    }

    # Give backend a moment to start
    Start-Sleep -Seconds 2

    # Run frontend in foreground so you see the output
    Push-Location frontend
    npm run dev
    Pop-Location

    # Clean up backend job when frontend exits
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
}

function Test-Health {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8080/api/health"
        $response | ConvertTo-Json
    } catch {
        Write-Host "Backend not running" -ForegroundColor Red
    }
}

function Test-Agents {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8080/api/agents"
        $response | ConvertTo-Json -Depth 5
    } catch {
        Write-Host "Backend not running" -ForegroundColor Red
    }
}

function Clean-Project {
    Write-Host "==> Cleaning build artifacts..." -ForegroundColor Cyan
    if (Test-Path "backend\venv") { Remove-Item -Recurse -Force "backend\venv" }
    if (Test-Path "backend\__pycache__") { Remove-Item -Recurse -Force "backend\__pycache__" }
    if (Test-Path "frontend\node_modules") { Remove-Item -Recurse -Force "frontend\node_modules" }
    if (Test-Path "frontend\.next") { Remove-Item -Recurse -Force "frontend\.next" }
    Write-Host "==> Clean!" -ForegroundColor Green
}

function Show-Help {
    Write-Host ""
    Write-Host "  Gemini Live Agent — Dev Commands" -ForegroundColor Cyan
    Write-Host "  ================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  .\dev.ps1 install    " -NoNewline -ForegroundColor Yellow; Write-Host "Install all dependencies"
    Write-Host "  .\dev.ps1 dev        " -NoNewline -ForegroundColor Yellow; Write-Host "Start backend + frontend"
    Write-Host "  .\dev.ps1 backend    " -NoNewline -ForegroundColor Yellow; Write-Host "Start backend only"
    Write-Host "  .\dev.ps1 frontend   " -NoNewline -ForegroundColor Yellow; Write-Host "Start frontend only"
    Write-Host "  .\dev.ps1 health     " -NoNewline -ForegroundColor Yellow; Write-Host "Check backend health"
    Write-Host "  .\dev.ps1 agents     " -NoNewline -ForegroundColor Yellow; Write-Host "List available agents"
    Write-Host "  .\dev.ps1 clean      " -NoNewline -ForegroundColor Yellow; Write-Host "Remove build artifacts"
    Write-Host "  .\dev.ps1 help       " -NoNewline -ForegroundColor Yellow; Write-Host "Show this message"
    Write-Host ""
}

switch ($Command) {
    "install"   { Install }
    "dev"       { Start-Dev }
    "backend"   { Start-Backend }
    "frontend"  { Start-Frontend }
    "health"    { Test-Health }
    "agents"    { Test-Agents }
    "clean"     { Clean-Project }
    "help"      { Show-Help }
    default     { Write-Host "Unknown command: $Command" -ForegroundColor Red; Show-Help }
}