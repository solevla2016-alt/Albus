# Запуск Albus из одного терминала: бэкенд + фронтенд
$FrontendRoot = Join-Path $PSScriptRoot "frontend"

if (-not (Test-Path (Join-Path $PSScriptRoot ".venv\Scripts\python.exe"))) {
    Write-Host "ERROR: не найден .venv. Установи зависимости." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $FrontendRoot "node_modules"))) {
    Write-Host "ERROR: не найден $FrontendRoot\node_modules. Выполни npm install." -ForegroundColor Red
    exit 1
}

Write-Host "Запускаю Albus ..." -ForegroundColor Cyan

# Окно 1: бэкенд
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "start-backend.ps1")

# Окно 2: фронтенд
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "start-frontend.ps1")

Write-Host "Бэкенд   -> http://localhost:8000" -ForegroundColor Green
Write-Host "Фронтенд -> http://localhost:3000" -ForegroundColor Green
Write-Host "Открой http://localhost:3000 в браузере" -ForegroundColor Yellow
