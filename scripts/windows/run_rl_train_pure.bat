@echo off
setlocal

REM Preset launcher for RL pure training
REM Usage:
REM   run_rl_train_pure.bat fast
REM   run_rl_train_pure.bat balanced
REM   run_rl_train_pure.bat full

set PROFILE=%1
if "%PROFILE%"=="" set PROFILE=balanced

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0run_rl_train_pure.ps1" -Profile %PROFILE% -UseGpu 1

if errorlevel 1 (
    echo.
    echo ERROR: RL pure training preset failed.
    pause
    exit /b 1
)

echo.
echo RL pure training preset completed.
pause
