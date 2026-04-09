@echo off
setlocal

REM Traffic IoC - Full Pure RL Training

cd /d "%~dp0..\.."

echo ========================================
echo  RL Full Pure Training
echo ========================================
echo.
echo Defaults:
echo   Episodes: 50
echo   Seed: 42
echo   Peak hours only: 1
echo   Date range: 2026-03-20 to 2026-04-08
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0run_rl_train_pure_full.ps1"

if errorlevel 1 (
    echo.
    echo ERROR: RL full pure training failed.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  RL Full Pure Training Finished
echo ========================================
pause
