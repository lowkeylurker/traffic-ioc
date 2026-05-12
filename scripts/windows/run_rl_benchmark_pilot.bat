@echo off
setlocal

REM Traffic IoC - RL Benchmark Pilot
REM Runs pure RL and warmstart RL with the same benchmark configuration

cd /d "%~dp0..\.."

echo ========================================
echo  RL Benchmark Pilot
echo ========================================
echo.
echo Defaults:
echo   Seeds: 42
echo   Episodes: 10
echo   Batch size: 64
echo   Eval ratio: 0.2
echo   Peak hours only: 1
echo   Date range: 2026-03-20 to 2026-03-24
echo   Max segments: 20 per corridor
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0run_rl_benchmark_pilot.ps1"

if errorlevel 1 (
    echo.
    echo ERROR: RL benchmark pilot failed.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  RL Benchmark Pilot Finished
echo ========================================
pause
