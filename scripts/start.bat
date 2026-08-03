@echo off
setlocal

set "ROOT=%~dp0.."
set "PYTHON=%ROOT%\.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo Virtual environment not found. Run scripts\setup.bat first.
    exit /b 1
)

pushd "%ROOT%" || exit /b 1
echo Vao2 is starting at http://127.0.0.1:8000
"%PYTHON%" backend\main.py
set "EXIT_CODE=%errorlevel%"
popd
exit /b %EXIT_CODE%
