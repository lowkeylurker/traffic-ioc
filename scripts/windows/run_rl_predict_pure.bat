@echo off
setlocal

REM Traffic IoC - Pure RL Prediction Demo

cd /d "%~dp0..\.."

echo ========================================
echo  RL Pure Prediction Demo
echo ========================================
echo.
echo Defaults:
echo   Model: best_rl_agent_pure_full.pt
echo   Artifacts: rl_pure_preprocessing_artifacts_full.pkl
echo   Request time: 2026-04-07 18:00:00
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0run_rl_predict_pure.ps1"

if errorlevel 1 (
    echo.
    echo ERROR: RL pure prediction demo failed.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  RL Pure Prediction Demo Finished
echo ========================================
pause
