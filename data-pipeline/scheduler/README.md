# 🚀 ETL Scheduler

**Automated ETL scheduling for Traffic IoC Data Pipeline using APScheduler.**

## Overview

The ETL Scheduler manages periodic execution of:
- **Real-time ETL**: Every 15 minutes during `06:00-21:00` VN (weather → traffic → incidents) [Quận 1 corridors]
- **Batch Analytics**: Daily at 2:00 AM UTC (baseline speed + corridor performance) [Q1 corridors]

---

## 📂 Structure

```
scheduler/
├── __init__.py              # Package initialization
├── app.py                   # Main scheduler application
├── requirements.txt         # Python dependencies (APScheduler)
├── Dockerfile               # Container build configuration
├── README.md                # This file
└── tests/
    └── test_scheduler.py    # Scheduler test script
```

---

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# From project root
docker-compose up -d

# Watch logs
docker logs -f etl-scheduler
```

### Option 2: Local Development

```bash
cd data-pipeline/scheduler

# Install dependencies
pip install -r requirements.txt

# Run scheduler
python app.py
```

### Option 3: Windows Batch

```bash
# From project root
start_scheduler.bat
```

---

## ⚙️ Configuration

### Schedule Frequency

Edit [app.py](app.py):

```python
# Realtime schedule (default): 06:00-21:00 every 15 minutes (inclusive at 21:00)
scheduler.add_job(
    run_realtime_then_batch,
    trigger=CronTrigger(hour="6-20", minute="0,15,30,45", timezone=VN_TZ),
    ...
)
scheduler.add_job(
    run_realtime_then_batch,
    trigger=CronTrigger(hour="21", minute="0", timezone=VN_TZ),
    ...
)

# Daily key health check
scheduler.add_job(
    run_daily_key_healthcheck,
    trigger=CronTrigger(hour="5", minute="50", timezone=VN_TZ),
    ...
)
```

### Job Timeouts

Edit [app.py](app.py):

```python
REALTIME_JOB = ETLJob(
    name="Real-time ETL",
    command=[...],
    timeout=300  # 5 minutes
)

BATCH_JOB = ETLJob(
    name="Batch Analytics",
    command=[...],
    timeout=1800  # 30 minutes
)
```

### Environment Variables

- `DB_CONNECTION_STRING`: PostgreSQL connection string
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)

---

## 🧪 Testing

### Run Test Script

```bash
cd scheduler
python tests/test_scheduler.py
```

This will run one real-time ETL job after 10 seconds.

### Manual Job Trigger

```bash
# Real-time ETL
docker exec data-pipeline python -m src.main run-realtime

# Batch analytics
docker exec data-pipeline python -m src.main run-batch
```

---

## 📊 Monitoring

### View Scheduler Logs

```bash
# Full scheduler log
docker logs -f etl-scheduler

# Or from file
docker exec etl-scheduler tail -f /app/logs/scheduler.log
```

### View Job Logs

```bash
# Real-time ETL log
docker exec etl-scheduler tail -f /app/logs/real-time-etl.log

# Batch analytics log
docker exec etl-scheduler tail -f /app/logs/batch-analytics.log
```

### Check Scheduler Status

```bash
# Verify scheduler is running
docker ps | grep etl-scheduler

# Check health
docker inspect etl-scheduler | grep -A 5 Health
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
docker-compose restart etl-scheduler
```

### Jobs not executing?

1. Check DB connection:
   ```bash
   docker logs etl-scheduler | grep "connect"
   ```

2. Verify time zone:
   ```bash
   docker exec etl-scheduler date
   ```

3. Check APScheduler logs:
   ```bash
   docker logs etl-scheduler | grep "apscheduler"
   ```

### Database connection error?

```bash
# Verify PostgreSQL is running
docker ps | grep postgres

# Check connection string
docker exec etl-scheduler env | grep DB_

# Test connection
docker exec data-pipeline python -c "from src.core.database import get_engine; print(get_engine())"
```

---

## 📁 Log Files

Logs are stored in persistent Docker volume:

```
pipeline_logs:/app/logs/
├── scheduler.log           # Main scheduler log
├── real-time-etl.log       # Real-time ETL output
└── batch-analytics.log     # Batch analytics output
```

---

## 🚨 Error Handling

The scheduler is designed to:
1. **Catch errors** and log them
2. **Continue running** (not crash)
3. **Retry** the next cycle

Example error in logs:
```
[ERROR] [Real-time ETL] ❌ Failed (exit=1) in 45.2s
DatabaseConnectionError: Could not connect to PostgreSQL
```

**Action to take:**
1. Check PostgreSQL health: `docker logs postgres`
2. Verify DB credentials in `.env`
3. Restart services: `docker-compose restart`

---

## 📈 Production Deployment

### Deploy to Server

```bash
# On production server
git pull origin main
docker-compose up -d --build
```

### Monitor in Production

```bash
# Watch logs
docker logs -f etl-scheduler

# Check last job execution
docker exec postgres psql -U traffic_user -d traffic_ioc \
  -c "SELECT COUNT(*), MAX(created_at) FROM fact_traffic_flow WHERE created_at > NOW() - INTERVAL '1 hour';"
```

---

## 🎯 Architecture

```
┌─────────────────────────────────────────┐
│ ETL Scheduler (APScheduler)             │
│ ┌─────────────────────────────────────┐ │
│ │ Real-time Job (Every 15 min)        │ │
│ │ └─> docker exec data-pipeline       │ │
│ │     python -m src.main run-realtime │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Batch Job (Daily 2 AM UTC)          │ │
│ │ └─> docker exec data-pipeline       │ │
│ │     python -m src.main run-batch    │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ Data Pipeline Container                 │
│ ├── Weather ETL                         │
│ ├── Traffic Flow ETL                    │
│ ├── Incident ETL                        │
│ ├── Baseline Speed                      │
│ └── Corridor Performance                │
└─────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│ PostgreSQL + PostGIS                    │
└─────────────────────────────────────────┘
```

---

## 📚 Related Documentation

- [Data Pipeline README](../README.md)
- [Docker Compose Configuration](../../docker-compose.yml)
- [ETL Architecture](../docs/IMPLEMENTATION_GUIDE.md)

---

## 📝 License

MIT License - See [LICENSE](../../LICENSE) file for details.
