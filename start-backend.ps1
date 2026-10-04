# Запуск бэкенда (Django)
$PythonVenv = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
Set-Location $PSScriptRoot
& $PythonVenv manage.py runserver 8000
