@echo off
REM Traffic IoC - Start All Services with Docker Compose
REM Double-click to start all core services (auto-start mode)

title Traffic IoC - Starting Services

echo ========================================
echo  Traffic IoC - Auto-Start Services
echo ========================================
echo.
echo Starting services...
echo   - PostgreSQL (Database)
echo   - Data Pipeline (ETL Container)
echo   - ETL Scheduler (Automated Jobs)
echo   - AI Core (ML Service)
echo.

REM Ensure commands run from repository root
cd /d "%~dp0..\.."

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running!
    echo Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Start services
echo Starting Docker Compose...
docker-compose up -d

echo.
echo ========================================
echo  Services Started!
echo ========================================
echo.
echo View logs:
echo   docker-compose logs -f etl-scheduler
echo.
echo Check status:
echo   docker-compose ps
echo.
echo Stop services:
echo   docker-compose down
echo.
echo ========================================

pause
