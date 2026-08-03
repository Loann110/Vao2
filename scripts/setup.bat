@echo off
setlocal

set "ROOT=%~dp0.."
pushd "%ROOT%" || exit /b 1

where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3 -m venv .venv
) else (
    python -m venv .venv
)

if errorlevel 1 goto :error

".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :error

".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto :error

echo.
echo Setup complete. Run scripts\start.bat to start Vao2.
popd
exit /b 0

:error
echo.
echo Setup failed. Make sure Python 3.10 or newer is installed.
popd
exit /b 1
