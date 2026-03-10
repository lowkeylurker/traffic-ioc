# Traffic IoC - Data Pipeline

> **Professional ETL/ELT pipeline** for real-time traffic monitoring and intelligent operations control in Ho Chi Minh City.

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](../LICENSE)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Q1 Corridor Selection Logic](#q1-corridor-selection-logic)
- [Budget Mode](#budget-mode)
- [ETL Scheduler](#etl-scheduler)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Monitoring & Logging](#monitoring--logging)
- [Data Schema](#data-schema)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

---

## 🎯 Overview

The **Traffic IoC Data Pipeline** is a production-grade ETL system that:

- **Extracts** real-time traffic data from TomTom Traffic API, OpenWeather API, and OpenStreetMap
- **Transforms** raw data into analytical dimensional models (Star Schema)
- **Loads** structured data into a PostgreSQL Data Warehouse with PostGIS extensions
- **Schedules** automated ETL jobs with APScheduler (15-minute cycles for real-time, daily for batch analytics)

### Key Features

✅ **Dimensional Modeling** – Star schema with 10+ dimensions and 7+ fact tables  
✅ **Real-time Processing** – Traffic flow & incidents updated every 15 minutes  
✅ **Spatial Intelligence** – PostGIS-powered road network analysis with Q1 corridor focus  
✅ **Automated Scheduling** – APScheduler daemon for ETL orchestration  
✅ **Budget Mode** – Flexible segment control (120-372 segments) with priority-based selection  
✅ **Idempotent Design** – Safe re-runs with UPSERT patterns  
✅ **Clean Architecture** – Modular pipelines following SOLID principles  
✅ **Production Ready** – Docker-compose stack with health checks & logging

---

## 🏗️ Architecture

### ETL Pipeline Phases

```text
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: STATIC DIMENSIONS (One-time initialization)       │
│ ┌────────────┐   ┌───────────┐   ┌──────────┐            │
│ │ dim_date   │──▶│ dim_shift │──▶│ dim_time │            │
│ └────────────┘   └───────────┘   └──────────┘            │
│ │ dim_month_year │ dim_holiday │ bridge_date_holiday │   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: SPATIAL NETWORK (One-time + periodic updates)     │
│ ┌──────────────┐   ┌──────────┐   ┌──────────────┐       │
│ │ dim_location │──▶│ dim_node │──▶│ dim_segment  │       │
│ └──────────────┘   └──────────┘   └──────────────┘       │
│ │ dim_road │ dim_way │ dim_corridor │ bridge_corridor │   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: REAL-TIME FACTS (Every 15 minutes)                │
│ ┌─────────────┐   ┌──────────────────┐   ┌──────────────┐ │
│ │ dim_weather │──▶│ fact_traffic_flow│──▶│fact_incident│ │
│ └─────────────┘   └──────────────────┘   └──────────────┘ │
│ Data Volume: 372 segments (Q1 full) or 120 (budget mode)   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PHASE 4: BATCH ANALYTICS (Daily at 2:00 AM UTC)            │
│ ┌────────────────────┐   ┌──────────────────────────┐     │
│ │ fact_baseline_speed│──▶│fact_corridor_performance │     │
│ └────────────────────┘   └──────────────────────────┘     │
│ Data Volume: 5-8 Q1 corridors aggregated daily             │
└─────────────────────────────────────────────────────────────┘
```

### Data Sources

| Source | Purpose | Update Frequency | Coverage |
|--------|---------|------------------|----------|
| **OpenStreetMap** | Road network topology | One-time + manual refresh | Full HCM City |
| **TomTom Traffic API** | Real-time traffic flow & incidents | Every 15 minutes | Q1 target corridors (372 segments) |
| **OpenWeather API** | Weather conditions | Every 15 minutes | City-wide |
| **GeoJSON (HCMC Gov)** | Administrative boundaries | Static | 24 districts |

---

## 🎯 Q1 Corridor Selection Logic

The pipeline uses **intelligent spatial filtering** to focus on District 1 (Quận 1) critical corridors:

### Selection Criteria

**Threshold-based Logic:**
1. **Main Corridors** – ≥40% of corridor length within Q1 boundary
2. **Gateway Corridors** – ≥15% within Q1 AND within 1,500m of Q1 boundary
3. **Segment Filtering** – Only major road types (motorway, trunk, primary, secondary, tertiary)

**Prioritization (for Budget Mode):**
- Segments ordered by `importance_level DESC, length_m DESC`
- Ensures most critical corridors selected first when applying limits

### Query Architecture

```sql
WITH q1_boundary AS (
  SELECT poly FROM dim_location WHERE name = 'quan 1'
),
all_corridor_segments AS (
  -- Join corridors with their segments
  SELECT c.corridor_key, s.segment_key, s.geom_line, ...
  FROM dim_corridor c
  JOIN bridge_corridor_segment bcs USING (corridor_key)
  JOIN dim_segment s USING (segment_key)
),
q1_corridor_segments AS (
  -- Calculate Q1 overlap per corridor
  SELECT 
    corridor_key,
    SUM(length_m) AS total_length,
    SUM(CASE WHEN ST_Intersects(geom_line, q1.poly) 
        THEN length_m END) AS q1_length,
    MIN(ST_Distance(geom_line, q1.poly)) AS min_distance_to_q1
  FROM all_corridor_segments
  GROUP BY corridor_key
),
selected_corridors AS (
  -- Apply 40% or gateway logic
  SELECT corridor_key
  FROM q1_corridor_segments
  WHERE (q1_length / total_length >= 0.40)  -- Main threshold
     OR (q1_length / total_length >= 0.15 
         AND min_distance_to_q1 <= 1500)    -- Gateway threshold
),
etl_segments AS (
  -- Final segment selection with prioritization
  SELECT s.*, c.importance_level, c.length_m AS corridor_length
  FROM dim_segment s
  JOIN bridge_corridor_segment bcs USING (segment_key)
  JOIN selected_corridors sc USING (corridor_key)
  JOIN dim_corridor c USING (corridor_key)
  WHERE ST_DWithin(s.geom_line, q1_boundary.poly, 1500)
    AND s.osm_highway_type IN ('motorway', 'trunk', 'primary', 'secondary', 'tertiary')
  ORDER BY importance_level DESC, corridor_length DESC, segment_key
)
SELECT * FROM etl_segments;
```

### Results

- **Selected Corridors**: 8 major corridors
- **Total Segments**: 372 segments (full coverage mode)
- **Active Segments**: ~366 segments (with latest traffic data)
- **Largest Corridor**: 143 segments
- **Smallest Corridor**: 6 segments

---

## 💰 Budget Mode

**Budget Mode** enables cost-optimized API usage by reducing segment count while preserving critical coverage.

### Overview

```bash
# Normal Mode (Full Coverage)
docker exec utraffic-data-pipeline python -m src.main run-realtime
# → Loads 372 segments, ~372 TomTom API calls

# Budget Mode (Cost-Optimized)
docker exec utraffic-data-pipeline python -m src.main run-realtime --budget-mode
# → Loads 120 segments, ~120 TomTom API calls (default limit)

# Custom Budget
docker exec utraffic-data-pipeline python -m src.main run-realtime --budget-mode --segment-limit 200
# → Loads 200 segments, ~200 TomTom API calls
```

### Key Features

- **Automatic Prioritization** – Selects segments by corridor importance and length
- **Configurable Limits** – Default 120 segments, customizable via `--segment-limit`
- **Graceful Fallback** – If limit exceeds available segments, uses maximum available
- **Zero Duplication** – Maintains segment deduplication regardless of mode

### Use Cases

| Scenario | Mode | Segments | API Calls/Day | Cost Savings |
|----------|------|----------|---------------|--------------|
| **Production Peak Hours** | Normal | 372 | ~35,712 | Baseline |
| **Production Off-Peak** | Budget (120) | 120 | ~11,520 | 68% reduction |
| **Development/Testing** | Budget (50) | 50 | ~4,800 | 87% reduction |
| **Emergency Rate Limit** | Budget (30) | 30 | ~2,880 | 92% reduction |

### Implementation

**CLI Flags:**
- `--budget-mode` – Enable budget mode (requires this flag)
- `--segment-limit N` – Set custom limit (default: 120)

**Code Reference:**
```python
# data-pipeline/src/main.py
@app.command()
def run_realtime(
    budget_mode: bool = typer.Option(False, "--budget-mode", 
        help="Enable budget mode (reduced segment count)"),
    segment_limit: int = typer.Option(120, "--segment-limit",
        help="Max segments in budget mode (default: 120)")
):
    # Automatically adjusts query LIMIT and prioritization
    full_target_coverage = not budget_mode
    # ...
```

### Scheduler Integration (Recommended)

Edit [`scheduler/app.py`](scheduler/app.py) to use time-based budget modes:

```python
# Off-peak hours (10 PM - 6 AM): Budget mode
scheduler.add_job(
    lambda: ETLJob(
        command=["docker", "exec", "data-pipeline",
                 "python", "-m", "src.main", "run-realtime",
                 "--budget-mode", "--segment-limit", "120"]
    ).run(),
    trigger=CronTrigger(hour="22-5", minute="*/15"),
    id='etl-realtime-budget'
)

# Peak hours (7 AM - 9 PM): Normal mode
scheduler.add_job(
    REALTIME_JOB.run,  # Normal mode (372 segments)
    trigger=CronTrigger(hour="7-21", minute="*/15"),
    id='etl-realtime-full'
)
```

### Technology Stack

- **Language**: Python 3.11+
- **Database**: PostgreSQL 14 + PostGIS 3.x + pgRouting
- **Scheduler**: APScheduler 3.10+
- **Containerization**: Docker + Docker Compose
- **CLI**: Typer + Rich (formatted console output)
- **ORM**: SQLAlchemy 2.x (Core API)
- **APIs**: httpx (async-capable client)

---

## ⏰ ETL Scheduler

### Overview

The ETL Scheduler is an **APScheduler-based daemon** that automates periodic data pipeline execution. It runs as a separate Docker container (`etl-scheduler`) and manages two distinct job types:

1. **Real-time Jobs** – Every 15 minutes (weather → traffic → incidents) **[Q1 Corridors: 372 segments]**
2. **Batch Jobs** – Daily at 2:00 AM UTC (baseline speed + corridor analytics) **[Q1 Corridors: 5-8 corridors]**

### Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     ETL SCHEDULER DAEMON                    │
│                     (APScheduler Process)                    │
└─────────────────────────────────────────────────────────────┘
           │                                │
           ▼                                ▼
┌──────────────────────┐      ┌──────────────────────────┐
│  REAL-TIME JOB       │      │  BATCH JOB               │
│  Trigger: Every 15min│      │  Trigger: Daily 2:00 AM  │
│  Timeout: 5 minutes  │      │  Timeout: 30 minutes     │
└──────────────────────┘      └──────────────────────────┘
           │                                │
           ▼                                ▼
    docker exec                      docker exec
    data-pipeline                    data-pipeline
    python -m src.main              python -m src.main
    run-realtime                    run-batch
           │                                │
           ▼                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATA WAREHOUSE                 │
│  fact_traffic_flow | fact_incident | fact_corridor_...     │
└─────────────────────────────────────────────────────────────┘
```

### Job Definitions

#### Real-time Job (Every 15 Minutes)

**Command:**
```bash
docker exec utraffic-data-pipeline python -m src.main run-realtime
```

**Pipeline:**
1. **Weather Update** – Fetch current weather from OpenWeather API → upsert `dim_weather`
2. **Traffic Flow** – Fetch real-time speeds from TomTom (372 Q1 segments) → upsert `fact_traffic_flow`
3. **Incidents** – Fetch active incidents from TomTom → upsert `fact_incident`

**Configuration:**
```python
# scheduler/app.py
REALTIME_JOB = ETLJob(
    name="Real-time ETL",
    command=["docker", "exec", "data-pipeline", 
             "python", "-m", "src.main", "run-realtime"],
    timeout=300  # 5 minutes max
)

scheduler.add_job(
    REALTIME_JOB.run,
    trigger=IntervalTrigger(minutes=15),
    id='etl-realtime',
    coalesce=True,       # Skip if previous run still active
    max_instances=1,     # Only 1 concurrent instance
    misfire_grace_time=60  # Allow 1 min late start
)
```

**Expected Output:**
```
[INFO] [Real-time ETL] ⏳ Starting...
[INFO]   Loaded 372 segment points from DB (target_corridors_Q1)
[INFO]   → dim_weather: 1 record upserted
[INFO]   → fact_traffic_flow: 372 records upserted
[INFO]   → fact_incident: 12 records upserted
[INFO] [Real-time ETL] ✅ Completed in 187.3s
```

**Budget Mode Output:**
```
[INFO] [Real-time ETL] ⏳ Starting...
[INFO]   Loaded 120 segment points from DB (target_corridors_Q1) (budget_mode=True)
[INFO]   → dim_weather: 1 record upserted
[INFO]   → fact_traffic_flow: 120 records upserted
[INFO]   → fact_incident: 8 records upserted
[INFO] [Real-time ETL] ✅ Completed in 95.6s
```

#### Batch Job (Daily at 2:00 AM UTC)

**Command:**
```bash
docker exec utraffic-data-pipeline python -m src.main run-batch
```

**Pipeline:**
1. **Baseline Speed** – Aggregate historical speeds (all segments) → insert `fact_baseline_speed`
2. **Corridor Performance** – Calculate corridor-level metrics (Q1 corridors only) → insert `fact_corridor_performance`

**Configuration:**
```python
# scheduler/app.py
BATCH_JOB = ETLJob(
    name="Batch Analytics",
    command=["docker", "exec", "data-pipeline", 
             "python", "-m", "src.main", "run-batch"],
    timeout=1800  # 30 minutes max
)

scheduler.add_job(
    BATCH_JOB.run,
    trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
    id='etl-batch',
    coalesce=True,
    max_instances=1,
    misfire_grace_time=600  # Allow 10 min late start
)
```

**Expected Output:**
```
[INFO] [Batch Analytics] ⏳ Starting...
[INFO]   Queried 5 corridor aggregation rows for date_key=20260309 (distinct_corridors=5)
[INFO]   → fact_baseline_speed: 842 records inserted
[INFO]   → fact_corridor_performance: 5 records inserted (Q1 corridors)
[INFO] [Batch Analytics] ✅ Completed in 1,234.5s
```

### Scheduler Configuration

**Environment Variables:**
```bash
# docker-compose.scheduler.yml
environment:
  - DB_CONNECTION_STRING=postgresql://user:pass@postgres:5432/traffic_ioc
  - LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR
  - TZ=UTC          # Timezone for cron triggers
```

**Resource Limits (Optional):**
```yaml
# docker-compose.scheduler.yml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 1G
    reservations:
      cpus: '0.5'
      memory: 512M
```

### Log Files

Logs are persisted in a Docker volume (`pipeline_logs:/app/logs`):

```
/app/logs/
├── scheduler.log              # Main scheduler daemon log
├── real-time-etl.log          # Real-time job output
└── batch-analytics.log        # Batch job output
```

**View Logs:**
```bash
# Live tail scheduler logs
docker logs -f etl-scheduler

# View real-time ETL log
docker exec etl-scheduler tail -f /app/logs/real-time-etl.log

# View batch analytics log
docker exec etl-scheduler tail -f /app/logs/batch-analytics.log
```

### Error Handling

The scheduler implements robust error handling:

1. **Timeout Protection** – Jobs auto-terminate if exceeded timeout (5 min / 30 min)
2. **Exception Catching** – Errors logged but don't crash scheduler daemon
3. **Retry Strategy** – Failed jobs retry on next scheduled cycle (natural retry)
4. **Coalescing** – Skips new job if previous still running (prevents overlap)

**Example Error Log:**
```
[ERROR] [Real-time ETL] ❌ Failed (exit=1) in 45.2s
DatabaseConnectionError: could not connect to server
    → Next retry: 14:15:00 (automatic)
```

### Manual Job Triggering

For testing or emergency data backfill:

```bash
# Manually trigger real-time job
docker exec utraffic-data-pipeline python -m src.main run-realtime

# Manually trigger batch job
docker exec utraffic-data-pipeline python -m src.main run-batch

# Check last execution time
docker exec postgres psql -U traffic_user -d traffic_ioc \
  -c "SELECT MAX(created_at) FROM fact_traffic_flow;"
```

### Monitoring Checklist

- [ ] Check scheduler is running: `docker ps | grep etl-scheduler`
- [ ] Verify last job completion: Check logs for `✅ Completed`
- [ ] Monitor job duration: Should be <5 min (real-time) or <30 min (batch)
- [ ] Check database writes: Query `fact_traffic_flow` for recent timestamps
- [ ] Review error logs: `grep "❌" /app/logs/scheduler.log`

### Scheduler Maintenance

**Restart Scheduler:**
```bash
docker-compose -f docker-compose.scheduler.yml restart etl-scheduler
```

**Rebuild After Code Changes:**
```bash
docker-compose -f docker-compose.scheduler.yml build etl-scheduler
docker-compose -f docker-compose.scheduler.yml up -d etl-scheduler
```

**Change Schedule:**
Edit [`scheduler/app.py`](scheduler/app.py) and rebuild:
```python
# Change from 15 min to 30 min
scheduler.add_job(
    REALTIME_JOB.run,
    trigger=IntervalTrigger(minutes=30),  # ← Modified
    ...
)
```

---

## 🚀 Quick Start

### Prerequisites

- Docker 20.x+ & Docker Compose 2.x+
- Python 3.11+ (for local development)
- PostgreSQL 14+ (managed via Docker)

### Full Stack Deployment

```bash
# 1. Clone repository
git clone <repo-url>
cd traffic-ioc

# 2. Configure environment
cp .env.example .env
# Edit .env: DB credentials, API keys (TomTom, OpenWeather)

# 3. Start services (DB + Pipeline + Scheduler)
docker-compose -f docker-compose.scheduler.yml up -d

# 4. Verify services
docker ps
# Expected: postgres, data-pipeline, etl-scheduler containers running

# 5. Initialize database (one-time)
docker exec utraffic-data-pipeline python -m src.main run-all

# 6. Check scheduler logs
docker logs -f etl-scheduler
# Expected: "ETL SCHEDULER INITIALIZED" + schedule info
```

### Testing Scheduler

```bash
# Quick scheduler test (runs one real-time job after 10 seconds)
cd data-pipeline/scheduler
python tests/test_scheduler.py

# Manual trigger (bypass scheduler)
docker exec data-pipeline python -m src.main run-realtime

# Verify data ingestion
docker exec postgres psql -U traffic_user -d traffic_ioc \
  -c "SELECT COUNT(*), MAX(created_at) FROM fact_traffic_flow WHERE created_at > NOW() - INTERVAL '30 minutes';"
```

---

## 💻 CLI Commands

The pipeline CLI (`src/main.py`) provides granular control over ETL phases:

### Core Commands

| Command | Description | Frequency | Duration |
|---------|-------------|-----------|----------|
| `run-all` | Full initialization (all 4 phases) | One-time | 15-30 min |
| `run-static` | Phase 1: Date/time/holiday dimensions | One-time | <1 min |
| `run-spatial` | Phase 2: Road network + corridors | One-time | 10-20 min |
| `run-realtime` | Phase 3: Weather → Traffic → Incidents (Q1 corridors) | Every 15 min | 3-5 min |
| `run-batch` | Phase 4: Baseline + corridor analytics | Daily 2 AM | 20-30 min |
| `health` | Check database connectivity | As needed | <1 sec |

### Usage Examples

```bash
# Inside data-pipeline container
docker exec utraffic-data-pipeline python -m src.main [COMMAND]

# Examples:
python -m src.main health                    # Test DB connection
python -m src.main run-static                # Initialize static dims
python -m src.main run-spatial               # Download OSM network
python -m src.main run-spatial --skip-osm    # Skip OSM, only location catalog
python -m src.main run-realtime              # One real-time cycle (372 segments)
python -m src.main run-batch                 # One analytics batch
python -m src.main run-all                   # Full ETL (all phases)
```

### Budget Mode Options

```bash
# Enable budget mode with default 120 segments
python -m src.main run-realtime --budget-mode

# Custom segment limit
python -m src.main run-realtime --budget-mode --segment-limit 200

# Production example: Full coverage
python -m src.main run-realtime
# → Loaded 372 segment points from DB (target_corridors_Q1)

# Development example: Budget mode
python -m src.main run-realtime --budget-mode --segment-limit 50
# → Loaded 50 segment points from DB (target_corridors_Q1)
```

### Advanced Options

```bash
# Skip specific steps in spatial phase
python -m src.main run-spatial \
  --skip-location \
  --skip-osm \
  --skip-corridor

# Force refresh location polygons
python -m src.main run-spatial --force-location-refresh

# Run with verbose logging
LOG_LEVEL=DEBUG python -m src.main run-realtime

# Check segment count without running ETL
docker exec postgres psql -U traffic_user -d traffic_ioc -c "
WITH q1_boundary AS (
  SELECT poly FROM dim_location WHERE name = 'quan 1'
),
selected_corridors AS (
  SELECT corridor_key FROM dim_corridor
  WHERE corridor_key IN (SELECT corridor_key FROM bridge_corridor_segment 
                          JOIN dim_segment USING (segment_key)
                          WHERE ST_DWithin(geom_line, (SELECT poly FROM q1_boundary), 1500))
)
SELECT COUNT(*) AS total_q1_segments
FROM dim_segment s
JOIN bridge_corridor_segment bcs USING (segment_key)
JOIN selected_corridors sc USING (corridor_key);
"
```

---

## ⚙️ Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=traffic_ioc
DB_USER=traffic_user
DB_PASSWORD=traffic_password
DB_CONNECTION_STRING=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# API Keys
TOMTOM_API_KEY=your_tomtom_key_here
OPENWEATHER_API_KEY=your_openweather_key_here

# Logging
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL

# Timezone
TZ=UTC  # Scheduler timezone
```

### Application Settings

Edit `src/core/config.py` for advanced configuration:

```python
# src/core/config.py
class Settings(BaseSettings):
    # Database
    db_connection_string: str
    db_pool_size: int = 10
    db_max_overflow: int = 20
    
    # API Rate Limits
    tomtom_requests_per_second: int = 5
    openweather_requests_per_minute: int = 60
    
    # ETL Parameters - Q1 Corridor Selection
    q1_main_threshold: float = 0.40          # 40% corridor length in Q1
    q1_gateway_threshold: float = 0.15       # 15% for gateway corridors
    gateway_distance_m: int = 1500           # 1.5km from Q1 boundary
    
    # Budget Mode
    budget_mode_default_limit: int = 120     # Default segment limit
    budget_mode_enabled: bool = False         # Default: Full coverage
    
    # Spatial Filters
    traffic_flow_bbox: tuple = (106.62, 10.72, 106.80, 10.85)  # Central HCM
    osm_cache_ttl_hours: int = 168  # 7 days
    
    # Scheduler
    realtime_interval_minutes: int = 15
    batch_cron_hour: int = 2  # 2:00 AM UTC
```

### Q1 Corridor Thresholds

The intelligent corridor selection uses these thresholds (defined in `src/main.py`):

```python
# Main corridor: ≥40% length within Q1
q1_main_threshold = 0.40

# Gateway corridor: ≥15% length + within 1500m
gateway_length_threshold = 0.15
gateway_distance_m = 1500

# These values balance coverage vs. API costs
# Adjust in code if different district focus needed
```

### Docker Compose Profiles

```yaml
# docker-compose.scheduler.yml
services:
  etl-scheduler:
    profiles: ["scheduler"]  # Optional: start only when needed
    
# Start with profile
docker-compose --profile scheduler up -d
```

---

## 📊 Monitoring & Logging

### Log Levels

```text
DEBUG   → Detailed SQL queries, API requests, cache hits
INFO    → Phase completion, record counts, timing
WARNING → Missing data, fallback rules triggered
ERROR   → API failures, database errors, exceptions
```

### Monitoring Queries

```sql
-- Real-time ETL health check (Q1 segments)
SELECT 
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS traffic_records,
    COUNT(DISTINCT segment_key) AS unique_segments
FROM fact_traffic_flow
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
-- Expected: 120-372 unique_segments per hour (depending on mode)

-- Budget mode detection
SELECT 
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(DISTINCT segment_key) AS segment_count,
    CASE 
        WHEN COUNT(DISTINCT segment_key) <= 150 THEN 'Budget Mode'
        WHEN COUNT(DISTINCT segment_key) >= 300 THEN 'Full Coverage'
        ELSE 'Partial Coverage'
    END AS etl_mode
FROM fact_traffic_flow
WHERE created_at > NOW() - INTERVAL '6 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Last batch run status (Q1 corridors)
SELECT 
    MAX(date_key) AS last_batch_date,
    COUNT(*) AS corridor_records,
    COUNT(DISTINCT corridor_key) AS unique_corridors
FROM fact_corridor_performance;
-- Expected: 5-8 unique_corridors per day

-- Q1 Corridor coverage summary
SELECT 
    c.corridor_key,
    c.corridor_name,
    c.importance_level,
    COUNT(DISTINCT s.segment_key) AS total_segments,
    COUNT(DISTINCT f.segment_key) AS segments_with_data_today
FROM dim_corridor c
JOIN bridge_corridor_segment bcs USING (corridor_key)
JOIN dim_segment s USING (segment_key)
LEFT JOIN fact_traffic_flow f ON f.segment_key = s.segment_key
    AND f.created_at > CURRENT_DATE
WHERE c.corridor_key IN (
    SELECT corridor_key FROM bridge_corridor_segment
    GROUP BY corridor_key
    HAVING COUNT(*) >= 6  -- Q1 corridors
)
GROUP BY c.corridor_key, c.corridor_name, c.importance_level
ORDER BY c.importance_level DESC, total_segments DESC;

-- Incident summary (last 24 hours)
SELECT 
    incident_type,
    COUNT(*) AS count
FROM fact_incident
WHERE start_time > NOW() - INTERVAL '24 hours'
GROUP BY incident_type
ORDER BY count DESC;

-- Weather coverage
SELECT 
    w.main_category,
    COUNT(*) AS observations
FROM fact_traffic_flow f
JOIN dim_weather w ON f.weather_key = w.weather_key
WHERE f.created_at > NOW() - INTERVAL '7 days'
GROUP BY w.main_category;

-- Segment prioritization check (for budget mode validation)
SELECT 
    c.importance_level,
    COUNT(DISTINCT s.segment_key) AS segment_count,
    SUM(s.length_m)::INT AS total_length_m
FROM dim_corridor c
JOIN bridge_corridor_segment bcs USING (corridor_key)
JOIN dim_segment s USING (segment_key)
WHERE s.segment_key IN (
    SELECT segment_key FROM fact_traffic_flow 
    WHERE created_at > NOW() - INTERVAL '1 hour'
)
GROUP BY c.importance_level
ORDER BY c.importance_level DESC;
-- Should show highest importance_level corridors have most segments
```

### Health Check Endpoint

```bash
# Run health check via CLI
docker exec utraffic-data-pipeline python -m src.main health

# Expected output:
# ✅ Database connection OK
# ✅ Last real-time ETL: 2026-03-09 14:15:32
# ✅ Last batch ETL: 2026-03-09 02:00:45
# ✅ Traffic records (last hour): 372 (Full) or 120 (Budget)
# ✅ Q1 Corridors: 8 selected

# Check segment loading
docker exec utraffic-data-pipeline python -m src.main run-realtime 2>&1 | grep "Loaded"
# Normal: "Loaded 372 segment points from DB (target_corridors_Q1)"
# Budget: "Loaded 120 segment points from DB (target_corridors_Q1)"
```

### Alerting Recommendations

Implement monitoring alerts for:

- [ ] No traffic data for >30 minutes
- [ ] Scheduler hasn't logged for >1 hour
- [ ] Batch job still running after 2 hours
- [ ] Database connection errors (3+ consecutive failures)
- [ ] Disk space <10% remaining
- [ ] **Segment count anomaly**: <100 segments in normal mode or <30 in budget mode
- [ ] **Q1 corridor coverage**: <5 corridors processed in batch ETL
- [ ] **API rate limit**: TomTom 429 errors detected
- [ ] **Segment prioritization failure**: Low-importance corridors selected before high-importance

---

## 🗄️ Data Schema

### Dimensional Model (Star Schema)

```text
                  ┌──────────────────┐
                  │ fact_traffic_flow│ (Partitioned by date_key)
                  └──────────────────┘
                     │  │  │  │  │  │
          ┌──────────┘  │  │  │  │  └──────────┐
          ▼             ▼  ▼  ▼  ▼             ▼
    ┌──────────┐  ┌────────┐ ┌───────┐  ┌────────────┐
    │dim_segment│  │dim_time│ │dim_date│  │dim_weather │
    └──────────┘  └────────┘ └───────┘  └────────────┘
          │             │          │
    ┌─────┴─────┐       │          │
    ▼           ▼       ▼          ▼
┌────────┐  ┌─────┐  ┌──────┐  ┌──────────────┐
│dim_way │  │dim_node│ │dim_shift│ │dim_month_year│
└────────┘  └─────┘  └──────┘  └──────────────┘
    │
    ▼
┌────────┐
│dim_road│
└────────┘
```

### Key Tables

**Dimensions:**
- `dim_date` (131K rows) – Date dimension (2020-2030)
- `dim_time_of_day` (1,440 rows) – Minute-level time dimension
- `dim_segment` (~15K rows) – Road segments with spatial geometries
- `dim_weather` (~50 rows) – Weather condition catalog
- `dim_corridor` (~30 rows) – Major arterial corridors

**Facts:**
- `fact_traffic_flow` (~5M rows/month) – Real-time traffic speeds
- `fact_incident` (~50K rows/month) – Traffic incidents
- `fact_corridor_performance` (~5K rows/month) – Aggregated corridor metrics
- `fact_baseline_speed` (~200K rows) – Historical speed baselines

**Bridges:**
- `bridge_corridor_segment` – Many-to-many corridor ↔ segment mapping
- `bridge_date_holiday` – Many-to-many date ↔ holiday mapping

### Database Extensions

```sql
CREATE EXTENSION postgis;       -- Spatial functions
CREATE EXTENSION pgrouting;     -- Routing algorithms
CREATE EXTENSION btree_gin;     -- Performance for composite indexes
CREATE EXTENSION pg_stat_statements;  -- Query performance monitoring
```

For complete schema details, see:
- `../infrastructure/postgres/2_create_dims.sql`
- `../infrastructure/postgres/3_create_facts.sql`
- [`specs/spec_5_target_mapping.md`](specs/spec_5_target_mapping.md)

---

## 🛠️ Development

### Local Setup (Without Docker)

```bash
# 1. Create virtual environment
cd data-pipeline
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
export DB_CONNECTION_STRING="postgresql://user:pass@localhost:5432/traffic_ioc"
export TOMTOM_API_KEY="your_key"
export OPENWEATHER_API_KEY="your_key"

# 4. Run CLI
python -m src.main health
python -m src.main run-realtime
```

### Project Structure

```text
data-pipeline/
├── src/
│   ├── __init__.py
│   ├── main.py                      # CLI entrypoint (Typer) + Budget Mode
│   ├── core/
│   │   ├── config.py                # Settings (Pydantic)
│   │   ├── database.py              # SQLAlchemy engine
│   │   └── logger.py                # Logging setup
│   ├── pipelines/
│   │   ├── static_dims/             # Phase 1: Date/time/holiday
│   │   ├── spatial/                 # Phase 2: OSM network
│   │   ├── realtime/                # Phase 3: Weather/traffic/incidents (Q1)
│   │   │   ├── traffic_pipeline.py  # Q1 segment selection logic
│   │   │   └── incident_pipeline.py
│   │   └── ml_features/             # Phase 4: ML feature engineering
│   │       └── corridor_pipeline.py # Q1 corridor performance (batch)
│   └── utils/
│       ├── api_clients/             # TomTom, OpenWeather clients
│       └── geometry_helpers.py      # PostGIS utilities
├── scripts/
│   ├── show_q1_etl_corridors.py     # Q1 corridor analysis (reference)
│   └── maintenance/                  # Database maintenance scripts
├── tests/
│   ├── test_pipelines.py
│   └── test_api_clients.py
├── scheduler/                       # ETL Scheduler (APScheduler)
│   ├── __init__.py
│   ├── app.py                       # Main scheduler daemon
│   ├── requirements.txt             # Scheduler dependencies
│   ├── Dockerfile                   # Scheduler container
│   ├── README.md                    # Scheduler documentation
│   └── tests/
│       └── test_scheduler.py        # Scheduler test script
├── logs/                            # Runtime logs (gitignored)
├── cache/                           # API response cache (gitignored)
├── docs/                            # Implementation guides
├── specs/                           # Technical specifications
├── run_full_etl.sh                  # Bash wrapper for run-all
├── requirements.txt
├── Dockerfile                       # CLI container
└── README.md                        # This file
```

**Key Files:**
- **`src/main.py`**: Contains Q1 corridor query + budget mode implementation (lines 402-603)
- **`src/pipelines/ml_features/corridor_pipeline.py`**: Batch analytics with Q1 filtering
- **`scripts/show_q1_etl_corridors.py`**: Reference implementation for Q1 logic validation

### Coding Standards

- **Style**: PEP 8 (enforced via `black` + `ruff`)
- **Type Hints**: Required for public functions
- **Docstrings**: Google-style format
- **Testing**: pytest with 80%+ coverage target
- **Imports**: Absolute imports only (`from src.core.config import settings`)

### Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html

# Test specific module
pytest tests/test_pipelines.py::test_traffic_flow_pipeline

# Test scheduler locally
cd scheduler
python tests/test_scheduler.py
```

### Adding New Pipeline

1. Create pipeline module in `src/pipelines/`
2. Implement `Extractor`, `Transformer`, `Loader` classes
3. Register command in `src/main.py`
4. Add tests in `tests/`
5. Update scheduler if periodic execution needed

---

## 🐛 Troubleshooting

### Common Issues

#### Scheduler Not Running

```bash
# Check container status
docker ps -a | grep etl-scheduler

# View error logs
docker logs etl-scheduler

# Restart scheduler
docker-compose -f docker-compose.scheduler.yml restart etl-scheduler
```

#### Jobs Not Executing

```bash
# Verify scheduler config
docker exec etl-scheduler cat scheduler/app.py | grep "add_job"

# Check timezone
docker exec etl-scheduler date

# Test manual execution
docker exec data-pipeline python -m src.main run-realtime
```

#### Database Connection Errors

```bash
# Test database connectivity
docker exec postgres pg_isready -U traffic_user

# Check connection string
docker exec etl-scheduler env | grep DB_CONNECTION_STRING

# Test from pipeline container
docker exec utraffic-data-pipeline python -m src.main health
```

#### API Rate Limit Exceeded

```
Error: 429 Too Many Requests (TomTom API)
```

**Solutions:**
1. **Enable Budget Mode (Recommended)**:
   ```bash
   # Reduce to 120 segments (68% reduction in API calls)
   docker exec utraffic-data-pipeline python -m src.main run-realtime --budget-mode
   
   # Or even lower for emergencies
   docker exec utraffic-data-pipeline python -m src.main run-realtime --budget-mode --segment-limit 50
   ```

2. **Reduce rate limits** in `config.py`:
   ```python
   tomtom_requests_per_second = 2  # Down from 5
   ```

3. **Check API quota** in TomTom developer portal

4. **Exponential backoff** (already implemented in code)

#### Incorrect Segment Count

```
Warning: Loaded only 50 segment points (expected 372)
```

**Diagnosis:**
```bash
# Check Q1 boundary exists
docker exec postgres psql -U traffic_user -d traffic_ioc -c "
SELECT name, ST_Area(poly::geography)/1000000 AS area_km2 
FROM dim_location WHERE name = 'quan 1';"

# Verify corridor selection logic
docker exec postgres psql -U traffic_user -d traffic_ioc -c "
SELECT COUNT(*) FROM dim_corridor WHERE corridor_key IN (
  SELECT DISTINCT corridor_key FROM bridge_corridor_segment 
  WHERE segment_key IN (
    SELECT segment_key FROM dim_segment 
    WHERE ST_DWithin(geom_line, (SELECT poly FROM dim_location WHERE name='quan 1'), 1500)
  )
);"
# Should return 8 corridors
```

**Solution:**
- Ensure `dim_location` has 'quan 1' (no Unicode 'quận')
- Re-run spatial initialization: `python -m src.main run-spatial`
- Check threshold values in `src/main.py` (q1_main_threshold=0.40)

#### Budget Mode Not Working

```
Error: Loaded 372 segments despite --budget-mode flag
```

**Solution:**
```bash
# Verify flag is passed correctly
docker exec utraffic-data-pipeline python -m src.main run-realtime --budget-mode 2>&1 | grep "budget_mode"

# Check query LIMIT clause in logs (should show query_limit=120)
docker exec utraffic-data-pipeline python -m src.main run-realtime --budget-mode 2>&1 | grep "query_limit"

# Verify segment prioritization query
docker exec postgres psql -U traffic_user -d traffic_ioc -c "
SELECT importance_level, COUNT(*) 
FROM dim_corridor c
JOIN bridge_corridor_segment bcs USING (corridor_key)
GROUP BY importance_level
ORDER BY importance_level DESC;"
```

#### OSM Download Timeout

```bash
# Use cached data if available
python -m src.main run-spatial --use-cache

# Download specific district only
python -m src.main run-osm-district1

# Increase timeout in src/utils/osm_client.py
```

#### Disk Space Issues

```bash
# Check Docker volume usage
docker system df -v

# Clean old logs
docker exec etl-scheduler find /app/logs -name "*.log" -mtime +30 -delete

# Remove unused images
docker image prune -a
```

---

## 📚 Documentation

### Comprehensive Documentation

All detailed documentation has been consolidated from 30+ markdown files. Key resources:

**Implementation Guides:**
- [`docs/implementation/CORRIDOR_IMPLEMENTATION_GUIDE.md`](docs/implementation/CORRIDOR_IMPLEMENTATION_GUIDE.md)
- [`docs/implementation/OSM_PERFORMANCE.md`](docs/implementation/OSM_PERFORMANCE.md)
- [`docs/implementation/CENTRAL_DISTRICTS_EXPANSION.md`](docs/implementation/CENTRAL_DISTRICTS_EXPANSION.md)

**Technical Specifications:**
- [`specs/spec_1_blueprint.md`](specs/spec_1_blueprint.md) – Master architecture blueprint
- [`specs/spec_2_base_interface.md`](specs/spec_2_base_interface.md) – ETL base classes
- [`specs/spec_3_data_contracts.md`](specs/spec_3_data_contracts.md) – API contract definitions
- [`specs/spec_4_business_logic.md`](specs/spec_4_business_logic.md) – Calculation formulas
- [`specs/spec_5_target_mapping.md`](specs/spec_5_target_mapping.md) – Database mappings

**Fact Table Contexts:**
- [`specs/seed_context_fact_traffic_flow_q1.md`](specs/seed_context_fact_traffic_flow_q1.md)
- [`specs/seed_context_fact_incident_q1.md`](specs/seed_context_fact_incident_q1.md)
- [`specs/seed_context_fact_corridor_performance_q1.md`](specs/seed_context_fact_corridor_performance_q1.md)

**Test Reports:**
- [`tests/results/COMPREHENSIVE_ANALYSIS_REPORT.md`](tests/results/COMPREHENSIVE_ANALYSIS_REPORT.md)
- [`tests/results/TOMTOM_TECHNICAL_REPORT.md`](tests/results/TOMTOM_TECHNICAL_REPORT.md)
- [`tests/results/OSM_COVERAGE_REPORT.md`](tests/results/OSM_COVERAGE_REPORT.md)

### External Resources

- [ETL Scheduling Proposal](../ETL_SCHEDULING_PROPOSAL.md) – Detailed scheduler design
- [ETL Scheduler Quick Start](scheduler/README.md) – Step-by-step setup guide
- [TomTom Traffic API Docs](https://developer.tomtom.com/traffic-api)
- [OpenWeather API Docs](https://openweathermap.org/api)
- [PostGIS Documentation](https://postgis.net/docs/)

---

## 📞 Support & Maintenance

### Maintenance Commands

```bash
# Health check all services
docker-compose -f docker-compose.scheduler.yml ps

# View all logs
docker-compose -f docker-compose.scheduler.yml logs -f

# Rebuild specific service
docker-compose -f docker-compose.scheduler.yml build data-pipeline

# Clean restart (preserves data)
docker-compose -f docker-compose.scheduler.yml restart

# Full reset (⚠️ destroys all data)
docker-compose -f docker-compose.scheduler.yml down -v
docker-compose -f docker-compose.scheduler.yml up -d
```

### Backup & Recovery

```bash
# Backup database
docker exec postgres pg_dump -U traffic_user traffic_ioc > backup_$(date +%Y%m%d).sql

# Backup logs
docker cp etl-scheduler:/app/logs ./logs_backup_$(date +%Y%m%d)

# Restore database
docker exec -i postgres psql -U traffic_user traffic_ioc < backup_20260309.sql
```

### Performance Tuning

```sql
-- Analyze table statistics
ANALYZE fact_traffic_flow;

-- Rebuild indexes
REINDEX TABLE fact_traffic_flow;

-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 1000  -- >1 second
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

This project is licensed under the MIT License – see [LICENSE](../LICENSE) file for details.

---

## � Recent Updates & Changelog

### March 9, 2026 - Q1 Corridor Focus & Budget Mode

**🎯 Q1 Corridor Selection Logic Implemented:**
- Changed from simple boundary containment to intelligent threshold-based selection
- Main corridors: ≥40% length within Q1 boundary
- Gateway corridors: ≥15% length + within 1,500m of boundary
- Result: **8 targeted corridors, 372 segments** (previously unstable ~4-613 range)

**💰 Budget Mode Feature:**
- Added `--budget-mode` and `--segment-limit` CLI flags to `run-realtime` command
- Segment prioritization by `importance_level DESC, length_m DESC`
- Default budget: 120 segments (68% cost reduction vs. 372 full coverage)
- Enables flexible API cost control for off-peak hours or development

**🔧 Query Alignment:**
- Synchronized corridor selection logic across `run-realtime`, `run-batch`, and analytical scripts
- Removed coordinate-level deduplication (preserved segment-level dedup only)
- Fixed boundary predicate mismatch ('quan 1' vs 'quận 1')

**📊 Batch ETL Optimization:**
- Limited `fact_corridor_performance` to latest time_key snapshot per day
- Reduced corridor aggregation from 29 to 5-8 Q1 corridors
- Improved query performance and result consistency

**🐛 Bug Fixes:**
- Fixed run-realtime loading only 4 segments (threshold too strict at 50%)
- Fixed run-batch selecting 29 corridors (no threshold applied)
- Fixed 613 segment anomaly (wider selection before Q1 logic)

---

## 🙏 Acknowledgments

- **TomTom** – Real-time traffic data API
- **OpenWeather** – Weather condition data
- **OpenStreetMap** – Road network topology
- **HCMC Department of Transport** – Administrative boundary data

---

**For detailed scheduler documentation, see:**
- [Scheduler README](scheduler/README.md) – Quick start guide and configuration
- [`scheduler/app.py`](scheduler/app.py) – Source code with inline documentation
- [`scheduler.py`](scheduler.py) – Source code with inline documentation

**Last Updated:** March 9, 2026  
**Maintainer:** Data Engineering Team  
**Version:** 2.0.0 (Q1 Focus + Budget Mode)
