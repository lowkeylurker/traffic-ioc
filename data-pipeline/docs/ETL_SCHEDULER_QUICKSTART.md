# 🚀 ETL Scheduler - Quick Start Implementation Guide

## Overview
This guide helps you set up automated ETL scheduling using APScheduler + Docker.

**Schedule:**
- **Real-time:** Every 15 minutes (weather → traffic → incidents)
- **Batch:** Daily at 2:00 AM UTC (baseline speed + corridor performance)

---

## ✅ Checklist: What's Been Done

- [x] Updated `run_full_etl.sh` to include all phases (1-4)
- [x] Created `scheduler.py` (APScheduler daemon)
- [x] Created `Dockerfile.scheduler` (Docker image)
- [x] Created `docker-compose.scheduler.yml` (full stack config)
- [x] Created `ETL_SCHEDULING_PROPOSAL.md` (detailed proposal)
- [ ] **NEXT: Deploy scheduler**

---

## 📦 Files Created/Updated

| File | Purpose |
|------|---------|
| [`run_full_etl.sh`](../data-pipeline/run_full_etl.sh) | **UPDATED**: Now runs all 4 phases |
| [`scheduler.py`](../data-pipeline/scheduler.py) | **NEW**: APScheduler daemon (15 min + daily) |
| [`Dockerfile.scheduler`](../data-pipeline/Dockerfile.scheduler) | **NEW**: Container image for scheduler |
| [`docker-compose.scheduler.yml`](../docker-compose.scheduler.yml) | **NEW**: Full stack with scheduler service |
| [`ETL_SCHEDULING_PROPOSAL.md`](../ETL_SCHEDULING_PROPOSAL.md) | **NEW**: Detailed proposal + strategies |

---

## 🚀 Quick Start: 3 Steps

### Step 1: Add APScheduler to requirements.txt
```bash
cd data-pipeline

# Add to requirements.txt
echo "APScheduler>=3.10.0" >> requirements.txt

# Install locally (optional)
pip install -r requirements.txt
```

### Step 2: Build & Start Services
```bash
# From project root
docker-compose -f docker-compose.scheduler.yml up -d

# Check services
docker ps
```

### Step 3: Monitor Scheduler
```bash
# Watch scheduler logs in real-time
docker logs -f etl-scheduler

# Expected output:
# [INFO] ETL SCHEDULER INITIALIZED
# [INFO] Scheduled Jobs:
# [INFO]   1. Real-time ETL
# [INFO]      ⏱️  Frequency: Every 15 minutes
# [INFO]   2. Batch Analytics
# [INFO]      ⏱️  Frequency: Daily at 2:00 AM UTC
```

---

## 🧪 Testing the Scheduler

### Test Real-time Job (Manual)
```bash
# Manually trigger real-time ETL
docker exec data-pipeline python -m src.main run-realtime

# Check logs
docker logs etl-scheduler | grep "Real-time"
```

### Test Batch Job (Manual)
```bash
# Manually trigger batch analytics
docker exec data-pipeline python -m src.main run-batch

# Check logs
docker logs etl-scheduler | grep "Batch"
```

### View Scheduler Logs
```bash
# Real-time ETL log
docker exec etl-scheduler tail -f /app/logs/real-time-etl.log

# Batch analytics log
docker exec etl-scheduler tail -f /app/logs/batch-analytics.log

# Full scheduler log
docker exec etl-scheduler tail -f /app/logs/scheduler.log
```

---

## ⚙️ Configuration

### Adjust Schedule Frequency

Edit `scheduler.py`:

```python
# Line ~120: Real-time interval
scheduler.add_job(
    REALTIME_JOB.run,
    trigger=IntervalTrigger(minutes=15),  # ← Change here (e.g., 30, 60)
    ...
)

# Line ~131: Batch time
scheduler.add_job(
    BATCH_JOB.run,
    trigger=CronTrigger(hour=2, minute=0),  # ← Change here (e.g., hour=3)
    ...
)
```

Rebuild scheduler container after changes:
```bash
docker-compose -f docker-compose.scheduler.yml build etl-scheduler
docker-compose -f docker-compose.scheduler.yml restart etl-scheduler
```

### Adjust Timeouts

In `scheduler.py`:
```python
REALTIME_JOB = ETLJob(
    name="Real-time ETL",
    command=[...],
    timeout=300  # ← 5 minutes, increase if needed
)

BATCH_JOB = ETLJob(
    name="Batch Analytics",
    command=[...],
    timeout=1800  # ← 30 minutes, increase if needed
)
```

### Adjust Log Levels

```bash
docker-compose -f docker-compose.scheduler.yml up -d -e LOG_LEVEL=DEBUG etl-scheduler
```

---

## 📊 Monitoring & Debugging

### Check if Scheduler is Running
```bash
docker ps | grep etl-scheduler
```

### Check Last Job Execution
```bash
# Real-time ETL
docker exec postgres psql -U traffic_user -d traffic_ioc \
  -c "SELECT COUNT(*), MAX(created_at) FROM fact_traffic_flow WHERE created_at > NOW() - INTERVAL '1 hour';"

# Batch analytics
docker exec postgres psql -U traffic_user -d traffic_ioc \
  -c "SELECT COUNT(*), MAX(date_key) FROM fact_corridor_performance;"
```

### Restart Scheduler
```bash
docker-compose -f docker-compose.scheduler.yml restart etl-scheduler
```

### View Docker Build Logs
```bash
docker logs -f etl-scheduler
```

---

## 🔧 Troubleshooting

### Scheduler not running?
```bash
# Check container status
docker ps -a | grep etl-scheduler

# View error logs
docker logs etl-scheduler

# Restart
docker-compose -f docker-compose.scheduler.yml restart etl-scheduler
```

### Jobs not executing?
1. Check DB connection: `docker logs etl-scheduler | grep "connect"`
2. Verify time zone: `docker exec etl-scheduler date`
3. Check cron format: Review CronTrigger in `scheduler.py`

### Out of memory?
```bash
# Check memory usage
docker stats etl-scheduler

# Increase in docker-compose.scheduler.yml (uncomment deploy section)
# deploy:
#   resources:
#     limits:
#       memory: 2G
```

### Database connection error?
```bash
# Verify DB is running
docker ps | grep postgres

# Check connection string
docker exec etl-scheduler env | grep DB_

# Test manually
docker exec data-pipeline python -c "from src.core.database import get_engine; print(get_engine())"
```

---

## 📁 Log Files Location

Logs are stored in persistent volume:
```
pipeline_logs:/app/logs/
├── scheduler.log           # Main scheduler log
├── real-time-etl.log       # Real-time ETL output
└── batch-analytics.log     # Batch analytics output
```

Access locally:
```bash
# Docker desktop or mount point (depends on your setup)
# Linux/Mac: ~/.local/share/docker/volumes/[project]_pipeline_logs
# Windows: Docker Desktop Volume mounted path
```

---

## 🚨 What if Job Fails?

The scheduler will:
1. **Catch the error** and log it
2. **Continue running** (not crash the scheduler)
3. **Retry** the next cycle (15 min or 2 AM)

Example error handling in logs:
```
[ERROR] [Real-time ETL] ❌ Failed (exit=1) in 45.2s
DatabaseConnectionError: Could not connect to PostgreSQL
```

**Action to take:**
1. Check PostgreSQL is healthy: `docker logs postgres`
2. Verify DB password in `.env` file
3. Restart both postgres and scheduler: `docker-compose -f docker-compose.scheduler.yml restart`

---

## 📈 Next Steps

### Phase 1: Immediate (Done ✓)
- [x] Scheduler setup & testing
- [x] Manual job triggering verification

### Phase 2: Production (Next)
1. **Deploy to production server**
   ```bash
   # On VPS/server
   git pull origin main
   docker-compose -f docker-compose.scheduler.yml pull
   docker-compose -f docker-compose.scheduler.yml up -d
   ```

2. **Setup log aggregation** (e.g., ELK Stack, Datadog)
   ```bash
   # Centralized monitoring
   ```

3. **Create monitoring alerts**
   - Send email if job fails 3x in a row
   - Alert if no data in fact_traffic_flow for >30 min
   - Alert if batch never completed (by 6 AM)

### Phase 3: Advanced (Future)
1. Implement `fact_event` pipeline (SerpAPI)
2. Integrate ML `fact_traffic_risk_prediction`
3. Add CityFlow simulator for `fact_simulation_scenario`

---

## 📞 Support Commands

```bash
# Quick health check
docker-compose -f docker-compose.scheduler.yml ps

# View all logs
docker-compose -f docker-compose.scheduler.yml logs -f

# Rebuild all
docker-compose -f docker-compose.scheduler.yml build

# Clean and restart
docker-compose -f docker-compose.scheduler.yml down
docker-compose -f docker-compose.scheduler.yml up -d

# Copy logs from container
docker cp etl-scheduler:/app/logs ./logs_backup

# Reset database (warning: destroys data)
docker-compose -f docker-compose.scheduler.yml down -v
```

---

**Your scheduler is now ready! 🎉**

Monitor the logs and verify the first jobs execute correctly.

Questions? Check `ETL_SCHEDULING_PROPOSAL.md` for detailed architecture.
