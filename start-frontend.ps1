# Запуск фронтенда (Next.js)
$NodePath = "C:\Users\73B5~1\Documents\DEVTOOLS\nodejs-v20"
$env:Path = "$NodePath;" + $env:Path
Set-Location (Join-Path $PSScriptRoot "frontend")
npm run dev