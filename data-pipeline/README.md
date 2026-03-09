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
✅ **Spatial Intelligence** – PostGIS-powered road network analysis  
✅ **Automated Scheduling** – APScheduler daemon for ETL orchestration  
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
│ Data Volume: ~3,000-5,000 records/cycle                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PHASE 4: BATCH ANALYTICS (Daily at 2:00 AM UTC)            │
│ ┌────────────────────┐   ┌──────────────────────────┐     │
│ │ fact_baseline_speed│──▶│fact_corridor_performance │     │
│ └────────────────────┘   └──────────────────────────┘     │
│ Data Volume: ~1,000 corridor aggregations/night            │
└─────────────────────────────────────────────────────────────┘
```

### Data Sources

| Source | Purpose | Update Frequency | Coverage |
|--------|---------|------------------|----------|
| **OpenStreetMap** | Road network topology | One-time + manual refresh | Full HCM City |
| **TomTom Traffic API** | Real-time traffic flow & incidents | Every 15 minutes | Central districts |
| **OpenWeather API** | Weather conditions | Every 15 minutes | City-wide |
| **GeoJSON (HCMC Gov)** | Administrative boundaries | Static | 24 districts |

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

1. **Real-time Jobs** – Every 15 minutes (weather → traffic → incidents)
2. **Batch Jobs** – Daily at 2:00 AM UTC (baseline speed + corridor analytics)

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
2. **Traffic Flow** – Fetch real-time speeds from TomTom → upsert `fact_traffic_flow`
3. **Incidents** – Fetch active incidents from TomTom → upsert `fact_incident`

**Configuration:**
```python
# scheduler.py
REALTIME_JOB = ETLJob(
    name="Real-time ETL",
    command=["docker", "exec", "utraffic-data-pipeline", 
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
[INFO]   → dim_weather: 1 record upserted
[INFO]   → fact_traffic_flow: 3,247 records upserted
[INFO]   → fact_incident: 12 records upserted
[INFO] [Real-time ETL] ✅ Completed in 187.3s
```

#### Batch Job (Daily at 2:00 AM UTC)

**Command:**
```bash
docker exec utraffic-data-pipeline python -m src.main run-batch
```

**Pipeline:**
1. **Baseline Speed** – Aggregate historical speeds → insert `fact_baseline_speed`
2. **Corridor Performance** – Calculate corridor-level metrics → insert `fact_corridor_performance`

**Configuration:**
```python
# scheduler.py
BATCH_JOB = ETLJob(
    name="Batch Analytics",
    command=["docker", "exec", "utraffic-data-pipeline", 
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
[INFO]   → fact_baseline_speed: 842 records inserted
[INFO]   → fact_corridor_performance: 156 records inserted
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
Edit `scheduler.py` and rebuild:
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
docker exec etl-scheduler python test_scheduler.py

# Manual trigger (bypass scheduler)
docker exec utraffic-data-pipeline python -m src.main run-realtime

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
| `run-realtime` | Phase 3: Weather → Traffic → Incidents | Every 15 min | 3-5 min |
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
python -m src.main run-realtime              # One real-time cycle
python -m src.main run-batch                 # One analytics batch
python -m src.main run-all                   # Full ETL (all phases)
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
    
    # ETL Parameters
    traffic_flow_bbox: tuple = (106.62, 10.72, 106.80, 10.85)  # Central HCM
    osm_cache_ttl_hours: int = 168  # 7 days
    
    # Scheduler
    realtime_interval_minutes: int = 15
    batch_cron_hour: int = 2  # 2:00 AM UTC
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
-- Real-time ETL health check
SELECT 
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS traffic_records
FROM fact_traffic_flow
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Last batch run status
SELECT 
    MAX(date_key) AS last_batch_date,
    COUNT(*) AS corridor_records
FROM fact_corridor_performance;

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
```

### Health Check Endpoint (Future)

```python
# Run health check via CLI
docker exec utraffic-data-pipeline python -m src.main health

# Expected output:
# ✅ Database connection OK
# ✅ Last real-time ETL: 2026-03-09 14:15:32
# ✅ Last batch ETL: 2026-03-09 02:00:45
# ✅ Traffic records (last hour): 3,247
```

### Alerting Recommendations

Implement monitoring alerts for:

- [ ] No traffic data for >30 minutes
- [ ] Scheduler hasn't logged for >1 hour
- [ ] Batch job still running after 2 hours
- [ ] Database connection errors (3+ consecutive failures)
- [ ] Disk space <10% remaining

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
│   ├── main.py                      # CLI entrypoint (Typer)
│   ├── core/
│   │   ├── config.py                # Settings (Pydantic)
│   │   ├── database.py              # SQLAlchemy engine
│   │   └── logger.py                # Logging setup
│   ├── pipelines/
│   │   ├── static_dims/             # Phase 1: Date/time/holiday
│   │   ├── spatial/                 # Phase 2: OSM network
│   │   ├── realtime/                # Phase 3: Weather/traffic/incidents
│   │   └── batch/                   # Phase 4: Analytics
│   └── utils/
│       ├── api_clients/             # TomTom, OpenWeather clients
│       └── geometry_helpers.py      # PostGIS utilities
├── tests/
│   ├── test_pipelines.py
│   └── test_api_clients.py
├── logs/                            # Runtime logs (gitignored)
├── cache/                           # API response cache (gitignored)
├── docs/                            # Implementation guides
├── specs/                           # Technical specifications
├── scheduler.py                     # APScheduler daemon
├── test_scheduler.py                # Scheduler test script
├── run_full_etl.sh                  # Bash wrapper for run-all
├── requirements.txt
├── Dockerfile                       # CLI container
├── Dockerfile.scheduler             # Scheduler container
└── README.md                        # This file
```

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
python test_scheduler.py
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
docker exec etl-scheduler cat scheduler.py | grep "add_job"

# Check timezone
docker exec etl-scheduler date

# Test manual execution
docker exec utraffic-data-pipeline python -m src.main run-realtime
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

**Solution:**
- Reduce `tomtom_requests_per_second` in `config.py`
- Implement exponential backoff (already included)
- Check API quota in TomTom developer portal

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
- [ETL Scheduler Quick Start](../ETL_SCHEDULER_QUICKSTART.md) – Step-by-step setup guide
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

## 🙏 Acknowledgments

- **TomTom** – Real-time traffic data API
- **OpenWeather** – Weather condition data
- **OpenStreetMap** – Road network topology
- **HCMC Department of Transport** – Administrative boundary data

---

**For detailed scheduler documentation, see:**
- [ETL_SCHEDULING_PROPOSAL.md](../ETL_SCHEDULING_PROPOSAL.md) – Comprehensive design doc
- [ETL_SCHEDULER_QUICKSTART.md](../ETL_SCHEDULER_QUICKSTART.md) – Quick start guide
- [`scheduler.py`](scheduler.py) – Source code with inline documentation

**Last Updated:** March 9, 2026  
**Maintainer:** Data Engineering Team
