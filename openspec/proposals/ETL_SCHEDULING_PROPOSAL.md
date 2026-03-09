# 📅 Proposal: ETL Scheduling Strategy - Traffic IoC DW

## Executive Summary
3-tier scheduling strategy cho fact table ETL:
1. **Init-Once** (chạy 1 lần): Static dims + Spatial network
2. **Real-time** (15 phút): Weather → Traffic Flow → Incidents  
3. **Batch/Nightly** (đêm): Baseline Speed + Corridor Performance

---

## 1. Scheduling Plan

### Tier 1: One-Time Initialization (Manual)
```bash
# Chạy khi deployment hoặc reset database
docker exec data-pipeline python -m src.main run-all
# hoặc:
bash data-pipeline/run_full_etl.sh
```
**Phạm vi:**
- Static dimensions (date, time, shift, holiday)
- Spatial network (location, node, road, segment, corridor)
- Initial weather snapshot
- Initial traffic flow + incident data

**Thời gian:** ~15-30 phút  
**Lặp:** Không (chỉ lần đầu hoặc reset)

---

### Tier 2: Real-time Facts (Every 15 Minutes)
```
Crontab: */15 * * * * (mỗi 15 phút)
```
**Command:**
```bash
docker exec -T data-pipeline python -m src.main run-realtime
```

**Xử lý:**
- `dim_weather` (current weather snapshot)
- `fact_traffic_flow` (live traffic speeds per segment)
- `fact_incident` (live incidents)

**Chi tiết:**
- **Extract:** OpenWeather API + TomTom Traffic API
- **Transform:** Thêm weather_key + time_of_day dimension
- **Load:** Upsert (idempotent) vào fact tables
- **Volume:** ~3000-5000 traffic records/cycle

**SLA:** Max 3-5 phút/cycle  
**Error handling:** Retry 3× với exponential backoff

---

### Tier 3: Batch Analytics (Nightly at 2 AM)
```
Crontab: 0 2 * * * (2:00 AM mỗi ngày)
```
**Command:**
```bash
docker exec -T data-pipeline python -m src.main run-batch
```

**Xử lý:**
- `fact_corridor_performance` (aggregate from hourly traffic)
- `fact_baseline_speed` (baseline speed per segment/hour)

**Chi tiết:**
- **Extract:** Aggregated fact_traffic_flow từ ngày trước
- **Transform:** Tính LOS (Level of Service) → corridor metrics
- **Load:** Insert (partitioned theo date) vào fact tables
- **Volume:** ~1000 corridor records/night

**SLA:** Max 30 phút  
**Schedule:** 2:00 AM (giờ traffic thấp nhất)

---

## 2. Implementation Options

### **Option A: Docker-Compose + APScheduler** (Recommended)
**Ưu điểm:**
- ✅ Self-contained, portable
- ✅ Python-native (dễ tích hợp)
- ✅ No extra dependencies (cron)

**Nhược điểm:**
- Container phải luôn chạy (resource overhead)
- Khó debug từ host machine

**Setup:**
```dockerfile
# data-pipeline/Dockerfile.scheduler
FROM python:3.11
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt APScheduler
COPY . .
CMD ["python", "scheduler.py"]
```

**Code:** (`data-pipeline/scheduler.py`)
```python
from apscheduler.schedulers.background import BackgroundScheduler
from src.main import run_realtime, run_batch
import atexit

scheduler = BackgroundScheduler()

# Real-time: Every 15 minutes
scheduler.add_job(run_realtime, 'interval', minutes=15, id='realtime')

# Batch: Daily 2 AM
scheduler.add_job(run_batch, 'cron', hour=2, minute=0, id='batch')

scheduler.start()
atexit.register(lambda: scheduler.shutdown())

if __name__ == "__main__":
    try:
        while True:
            pass  # Keep scheduler running
    except KeyboardInterrupt:
        scheduler.shutdown()
```

---

### **Option B: Kubernetes CronJob** (For Production)
**Ưu điểm:**
- ✅ Stateless, ephemeral pods
- ✅ Native Kubernetes integration
- ✅ Easy monitoring + logging

**Nhược điểm:**
- Require Kubernetes infrastructure
- More complex setup

**Setup:** (K8s manifests)
```yaml
# k8s/cronjob-realtime.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: etl-realtime
spec:
  schedule: "*/15 * * * *"  # Every 15 minutes
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: etl
            image: data-pipeline:latest
            command: ["python", "-m", "src.main", "run-realtime"]
          restartPolicy: OnFailure
```

---

### **Option C: Systemd Timer + Host Cron** (For VPS/Linux Servers)
**Ưu điểm:**
- ✅ Minimal overhead
- ✅ No container runtime overhead
- ✅ Native OS integration

**Nhược điểm:**
- OS-specific (Linux only)
- Need proper Python environment

**Setup:** (crontab -e)
```bash
# Real-time: Every 15 minutes
*/15 * * * * cd /path/to/traffic-ioc/data-pipeline && python -m src.main run-realtime >> /var/log/etl-realtime.log 2>&1

# Batch: Daily 2 AM
0 2 * * * cd /path/to/traffic-ioc/data-pipeline && python -m src.main run-batch >> /var/log/etl-batch.log 2>&1
```

---

## 3. Recommended Setup: Docker-Compose Enhanced

### Step 1: Update `docker-compose.yml`
```yaml
services:
  data-pipeline:
    build: ./data-pipeline
    container_name: data-pipeline
    environment:
      - DB_CONNECTION_STRING=postgresql://...
    volumes:
      - ./data-pipeline:/app
    depends_on:
      - postgres

  etl-scheduler:  # NEW
    build:
      context: ./data-pipeline
      dockerfile: Dockerfile.scheduler
    container_name: etl-scheduler
    environment:
      - DB_CONNECTION_STRING=postgresql://...
    depends_on:
      - postgres
      - data-pipeline
    restart: always
```

### Step 2: Add `data-pipeline/requirements.txt`
```
APScheduler>=3.10.0
```

### Step 3: Create `data-pipeline/scheduler.py`
```python
import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
import subprocess
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ETL-Scheduler")

def run_realtime():
    """Run real-time ETL (weather → traffic → incidents)."""
    logger.info("[Real-time] Starting ETL pipeline...")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "src.main", "run-realtime"],
            capture_output=True,
            text=True,
            timeout=300  # 5 min max
        )
        if result.returncode == 0:
            logger.info("[Real-time] ✅ Completed")
        else:
            logger.error(f"[Real-time] ❌ Failed: {result.stderr}")
    except subprocess.TimeoutExpired:
        logger.error("[Real-time] ❌ Timeout (>5 min)")
    except Exception as e:
        logger.error(f"[Real-time] ❌ Exception: {e}")

def run_batch():
    """Run batch analytics (baseline speed + corridor performance)."""
    logger.info("[Batch] Starting ETL pipeline...")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "src.main", "run-batch"],
            capture_output=True,
            text=True,
            timeout=1800  # 30 min max
        )
        if result.returncode == 0:
            logger.info("[Batch] ✅ Completed")
        else:
            logger.error(f"[Batch] ❌ Failed: {result.stderr}")
    except subprocess.TimeoutExpired:
        logger.error("[Batch] ❌ Timeout (>30 min)")
    except Exception as e:
        logger.error(f"[Batch] ❌ Exception: {e}")

if __name__ == "__main__":
    scheduler = BackgroundScheduler()
    
    # Real-time: Every 15 minutes
    scheduler.add_job(
        run_realtime,
        trigger=IntervalTrigger(minutes=15),
        id='etl-realtime',
        name='Real-time ETL (Weather → Traffic → Incidents)',
        coalesce=True,  # Skip if previous run still ongoing
        max_instances=1
    )
    
    # Batch: Daily 2 AM
    scheduler.add_job(
        run_batch,
        trigger=CronTrigger(hour=2, minute=0),
        id='etl-batch',
        name='Batch Analytics (Baseline + Corridor)',
        coalesce=True,
        max_instances=1
    )
    
    logger.info("🚀 ETL Scheduler started")
    logger.info("  ⏱️  Real-time: Every 15 minutes")
    logger.info("  🌙 Batch: Daily at 2:00 AM")
    
    scheduler.start()
    
    try:
        while True:
            pass  # Keep running
    except KeyboardInterrupt:
        scheduler.shutdown()
        logger.info("🛑 Scheduler stopped")
```

### Step 4: Create `data-pipeline/Dockerfile.scheduler`
```dockerfile
FROM python:3.11

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt APScheduler

# Copy source
COPY . .

# Run scheduler
CMD ["python", "scheduler.py"]
```

### Step 5: Run
```bash
docker-compose up -d etl-scheduler

# Check logs
docker logs -f etl-scheduler
```

---

## 4. Monitoring & Alerting

### Logs Structure
```
/data-pipeline/logs/
├── etl-realtime.log
└── etl-batch.log
```

### Health Check Endpoint (Optional)
```python
# data-pipeline/src/health.py
from datetime import datetime
from src.core.database import get_engine

def check_etl_health():
    """Check last ETL run times."""
    engine = get_engine()
    with engine.connect() as conn:
        # Last realtime run
        last_realtime = conn.execute(
            "SELECT MAX(created_at) FROM fact_traffic_flow"
        ).scalar()
        
        # Last batch run
        last_batch = conn.execute(
            "SELECT MAX(date_key) FROM fact_corridor_performance"
        ).scalar()
        
        return {
            "last_realtime": last_realtime,
            "last_batch": last_batch,
            "health": "OK" if last_realtime else "ERROR"
        }
```

---

## 5. Migration Plan

### Phase 0: Current State
✅ Manual execution: `bash run_full_etl.sh`

### Phase 1: Immediate (This Sprint)
1. ✅ Update `run_full_etl.sh` to include phases 3-4
2. Create `scheduler.py` + `Dockerfile.scheduler`
3. Test locally with docker-compose

### Phase 2: Production (Next Sprint)
1. Deploy scheduler container to VPS/K8s
2. Setup monitoring (logs aggregation)
3. Create runbooks for manual intervention

### Phase 3: Future
1. Implement `fact_event` pipeline (SerpAPI)
2. Integrate ML model for `fact_traffic_risk_prediction`
3. CityFlow simulator for `fact_simulation_scenario`

---

## 6. Troubleshooting

### Real-time job failing?
```bash
# Check logs
docker logs etl-scheduler | grep "Real-time"

# Manual test
docker exec data-pipeline python -m src.main run-realtime
```

### Batch job timing issues?
```bash
# Check if batch ran
docker exec postgres psql -U traffic_user -d traffic_ioc \
  -c "SELECT MAX(date_key) FROM fact_corridor_performance"

# Force manual run at odd time
docker exec data-pipeline python -m src.main run-batch
```

### Database connection errors?
- Check `DB_CONNECTION_STRING` in docker-compose
- Verify postgres container is running
- Check logs: `docker logs postgres`

---

## 7. Cost & Performance Summary

| Tier | Frequency | Data | Time | Cost |
|------|-----------|------|------|------|
| **Real-time** | 15 min × 96/day | 3-5K rows | 3-5 min | ~$2-4/day API |
| **Batch** | 1 × /day | 1K rows | 20-30 min | Included |
| **Storage** | - | ~10GB/month | - | ~$5/month |

**Total:** ~$65-90/month (primarily API calls)

---

## 8. Decision Matrix

| Aspect | APScheduler | K8s CronJob | Linux Cron |
|--------|------------|-----------|-----------|
| **Setup Complexity** | Low | High | Very Low |
| **Portability** | High (Docker) | High | Low |
| **Production Ready** | Medium | High | High |
| **Scalability** | Limited | Excellent | N/A |
| **Best For** | dev/small deployments | large K8s clusters | VPS/single server |

**Recommendation:** APScheduler for MVP, migrate to K8s CronJob if scaling beyond 1 server.

---

---

**Status:** Proposal ready for review & implementation  
**Owner:** DevOps/Data Engineering  
**Timeline:** 1 sprint (Phase 1) + 2 sprints (Phase 2)
