@echo off
REM ETL Scheduler Runner for Windows
REM Double-click to start the scheduler

title Traffic IoC - ETL Scheduler

echo ========================================
echo  Traffic IoC ETL Scheduler
echo ========================================
echo.
echo Starting scheduler...
echo.

cd /d "%~dp0data-pipeline\scheduler"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found in PATH!
    echo Please install Python or activate virtual environment.
    pause
    exit /b 1
)

REM Check if APScheduler is installed
python -c "import apscheduler" >nul 2>&1
if errorlevel 1 (
    echo APScheduler not found. Installing...
    pip install APScheduler
)

REM Run scheduler
python app.py

pause
