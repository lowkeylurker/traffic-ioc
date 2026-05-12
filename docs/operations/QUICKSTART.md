# 🚀 Quick Start Guide

## Start Services (Automatic Mode)

### Option 1: Double-click (Windows)

**Windows:**
```
scripts/windows/start_services.bat
```

Hoặc nếu chỉ muốn chạy scheduler locally:
```
start_scheduler.bat
```

### Option 2: Command Line

```bash
# Start all core services (auto-start when Docker Desktop opens)
docker-compose up -d

# Watch logs
docker-compose logs -f etl-scheduler

# Check status
docker-compose ps
```

### Option 3: With Full Stack (Backend + Frontend)

```bash
# Include backend and frontend
docker-compose --profile fullstack up -d

# This starts:
# - postgres
# - data-pipeline  
# - etl-scheduler
# - ai-core
# - backend (Express.js)
# - frontend (React)
```

## What Happens Automatically?

When you start services, the **ETL Scheduler** automatically:

1. ✅ Waits for PostgreSQL to be ready
2. ✅ Runs **realtime ETL** (weather → traffic → incidents)
3. ✅ If successful, immediately runs **batch analytics**
4. ✅ Repeats every **15 minutes**

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Scheduler only
docker-compose logs -f etl-scheduler

# Data pipeline
docker-compose logs -f data-pipeline

# Last 100 lines
docker-compose logs --tail=100 etl-scheduler
```

### Check Running Services

```bash
docker-compose ps
```

Expected output:
```
NAME                STATUS              PORTS
traffic_ioc_postgres   Up 5 minutes       0.0.0.0:5433->5432/tcp
data-pipeline          Up 5 minutes       
etl-scheduler          Up 5 minutes       
ai-core                Up 5 minutes       0.0.0.0:5000->5000/tcp
```

### Check Scheduler Jobs

```bash
docker-compose logs etl-scheduler | grep "Chained ETL"
```

Expected:
```
[INFO] 📅 Scheduled Jobs:
[INFO]   1. Chained ETL (Realtime → Batch)  
[INFO]      ⏱️  Frequency: Every 15 minutes
```

## Stop Services

```bash
# Stop but keep data
docker-compose stop

# Stop and remove containers (data persists in volumes)
docker-compose down

# Stop and remove everything including volumes (⚠️ deletes all data)
docker-compose down -v
```

## Manual ETL Trigger

If you want to run ETL manually (without waiting for scheduler):

```bash
# Realtime ETL
docker-compose exec data-pipeline python -m src.main run-realtime

# Batch analytics
docker-compose exec data-pipeline python -m src.main run-batch

# Full ETL (all phases)
docker-compose exec data-pipeline python -m src.main run-all
```

## Troubleshooting

### Services not starting?

```bash
# Check Docker is running
docker info

# View detailed logs
docker-compose logs

# Rebuild containers
docker-compose build
docker-compose up -d
```

### Scheduler not running jobs?

```bash
# Check if scheduler is running
docker-compose ps etl-scheduler

# View scheduler logs
docker-compose logs -f etl-scheduler

# Restart scheduler
docker-compose restart etl-scheduler
```

### Database connection errors?

```bash
# Check PostgreSQL is healthy
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U traffic_user -d traffic_ioc -c "SELECT 1;"

# View database logs
docker-compose logs postgres
```

### Jobs failing?

```bash
# Check data-pipeline logs
docker-compose logs data-pipeline

# Check if data-pipeline container is available
docker-compose exec data-pipeline python --version

# Manually test ETL
docker-compose exec data-pipeline python -m src.main run-realtime
```

## Configuration

### Change ETL Frequency

Edit [data-pipeline/scheduler/app.py](../../data-pipeline/scheduler/app.py):

```python
# Line ~190: Change interval
scheduler.add_job(
    run_realtime_then_batch,
    trigger=IntervalTrigger(minutes=30),  # Changed from 15 to 30
    ...
)
```

Then rebuild:
```bash
docker-compose build etl-scheduler
docker-compose restart etl-scheduler
```

### Disable Auto-Start

Edit [docker-compose.yml](../../docker-compose.yml):

```yaml
etl-scheduler:
  ...
  restart: "no"  # Changed from "always"
```

### Environment Variables

Create `.env` file in project root:

```env
DB_USER=traffic_user
DB_PASSWORD=traffic_password
DB_NAME=traffic_ioc
DB_PORT=5433
AI_SERVICE_PORT=5000
```

## Next Steps

1. ✅ Services are running automatically
2. 📊 Check [UNIFIED_DOCKER_COMPOSE.md](UNIFIED_DOCKER_COMPOSE.md) for details
3. 📚 Read [data-pipeline/README.md](../../data-pipeline/README.md) for ETL documentation
4. 🔧 Configure [data-pipeline/.env](../../data-pipeline/.env) with API keys

## Architecture

```
Docker Desktop Start
        │
        ▼
┌───────────────────────┐
│ docker-compose up -d  │
└───────────────────────┘
        │
        ├─▶ postgres (restart: always)
        ├─▶ data-pipeline (restart: always)
        ├─▶ etl-scheduler (restart: always)
        │       │
        │       ▼
        │   ┌─────────────────┐
        │   │ Every 15 minutes│
        │   └─────────────────┘
        │       │
        │       ├─▶ Realtime ETL
        │       │   ✅ Success?
        │       │       │
        │       │       └─▶ Batch ETL (immediate)
        │       │
        │       └─▶ Repeat...
        │
        └─▶ ai-core (restart: unless-stopped)
```

---

**Status:** ✅ Production Ready  
**Last Updated:** March 10, 2026  
**Auto-Start:** Enabled
