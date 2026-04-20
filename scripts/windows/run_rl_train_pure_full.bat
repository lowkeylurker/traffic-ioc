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
echo Optional:
echo   Set RL_USE_GPU=1 to run with docker-compose.gpu.yml override
echo   Set RL_DEVICE=cuda to force CUDA in trainer
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
