# Traffic IoC - Data Pipeline

Production ETL pipeline for traffic monitoring in HCMC with dynamic multi-key TomTom budgeting.

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](../LICENSE)

---

## Overview

This pipeline:

- Extracts weather, traffic flow, and incidents every 15 minutes during active windows.
- Uses a TomTom API key pool with per-key rotation, blocking, and daily reset.
- Retries the same traffic point with the next usable key when a key returns HTTP 403.
- Auto-computes request budget from key count (`N_keys x 2500 / 61 cycles`).
- Writes realtime facts (`fact_traffic_flow`, `fact_incident`) and batch metrics (`fact_corridor_performance`).
- Runs as chained scheduler jobs: realtime first, then batch immediately on success.

Current design target is a quality-first gold corridor dataset: a small whitelist of priority corridors is selected first, then budget is concentrated to keep corridor-level coverage high.

OpenWeather now runs in grid mode (Option C) for better local weather precision. See detailed runbook: `docs/OWM_OPERATIONS.md`.

---

## Runtime Model

### ETL Windows

- Window: `06:00-21:00` (VN time, inclusive at `21:00`)
- Frequency: every 15 minutes inside windows
- Total active cycles/day: `61`

### Chained Execution

At each cycle:

1. `run-realtime --budget-mode --segment-limit <SAFE_TRAFFIC_SEGMENT_LIMIT>`
2. If realtime succeeds, run `run-batch` immediately

There is also a daily key health check at `05:50` VN:

- `python -m src.main health-tomtom-keys`
- Reports: `usable_keys`, `blocked_keys`, `effective_budget/cycle`, `safe_traffic_segment_limit/cycle`

### Gold Corridor Mode

The current production strategy is `quality-first gold corridors`:

- Only corridors listed in `GOLD_CORRIDOR_NAMES` are eligible for the corridor-quality dataset.
- Realtime allocation first guarantees a minimum corridor coverage floor.
- Remaining budget is used to top up only those admitted gold corridors.
- Batch corridor performance is filtered to the same whitelist, so `fact_corridor_performance` stays aligned with the realtime gold dataset.

Current runtime knobs:

- `TARGET_CORRIDOR_MIN_COVERAGE_PCT=0.60`
- `GOLD_CORRIDOR_NAMES=...`

---

## Budget Strategy

### Formula

Budget is auto-computed in scheduler and CLI startup:

- `budget_per_cycle = (N_keys x TOMTOM_DAILY_LIMIT_PER_KEY) / 61`
- `safe_traffic_segment_limit = (budget_per_cycle - NON_TRAFFIC_REQ_RESERVE) x (1 - TRAFFIC_REQ_HEADROOM_PCT)`

Default reserve/headroom:

- `NON_TRAFFIC_REQ_RESERVE=3`
- `TRAFFIC_REQ_HEADROOM_PCT=0.10`

### Capacity Reference

| Keys | Daily Budget | Budget/Cycle | Safe Segments/Cycle |
|------|--------------|--------------|----------------------|
| 1 | 2,500 | ~40 | ~33 |
| 3 | 7,500 | ~122 | ~107 |
| 5 | 12,500 | ~204 | ~180 |
| 6 | 15,000 | ~245 | ~217 |
| 10 | 25,000 | ~409 | ~365 |
| 20 | 50,000 | ~819 | ~734 |

Notes:

- Budget is still computed globally, but consumed only by admitted gold corridors.
- This design intentionally sacrifices breadth to improve corridor-level data quality.

---

## Quick Start

From project root (`traffic-ioc`):

```bash
# Start services
docker compose up -d

# Check pipeline DB connectivity
docker compose exec data-pipeline python -m src.main health

# Run one realtime cycle manually
docker compose exec data-pipeline python -m src.main run-realtime --budget-mode

# Run one full cycle manually (realtime -> batch)
docker compose exec data-pipeline python -m src.main run-cycle

# Check TomTom keys health
docker compose exec data-pipeline python -m src.main health-tomtom-keys

# Follow scheduler logs
docker compose logs -f etl-scheduler
```

---

## CLI Commands

Main CLI entrypoint: `python -m src.main`

| Command | Description |
|---------|-------------|
| `health` | Check PostgreSQL connectivity |
| `health-tomtom-keys` | Probe all TomTom keys and print effective budget |
| `run-static` | Load static dimensions |
| `run-spatial` | Build spatial dimensions / corridors |
| `run-realtime` | One realtime cycle (weather -> traffic -> incidents) |
| `run-mock-incidents` | Generate simulated incidents for demo/testing |
| `run-batch` | Batch analytics (baseline + corridor performance) |
| `run-cycle` | One-shot ETL cycle: realtime then batch |
| `run-all` | Full initialization sequence |

Realtime options:

- `--budget-mode`: honor segment limit (used by scheduler)
- `--segment-limit N`: max segment points for this cycle

Examples:

```bash
# Default budget from key pool
docker compose exec data-pipeline python -m src.main run-realtime --budget-mode

# Custom cap
docker compose exec data-pipeline python -m src.main run-realtime --budget-mode --segment-limit 500

# Run full chained cycle without waiting for scheduler window
docker compose exec data-pipeline python -m src.main run-cycle
```

---

## Configuration

Edit `data-pipeline/.env`:

```dotenv
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=traffic_ioc
DB_USER=traffic_user
DB_PASSWORD=traffic_password
DB_SSLMODE=disable

# TomTom key pool (priority over TOMTOM_API_KEY)
TOMTOM_API_KEYS=key1,key2,key3
TOMTOM_API_KEY=key1
TOMTOM_DAILY_LIMIT_PER_KEY=2500

# Quality-first gold corridor dataset
TARGET_CORRIDOR_MIN_COVERAGE_PCT=0.60
GOLD_CORRIDOR_NAMES=Cách Mạng Tháng 8,Nguyễn Văn Linh,Nguyễn Hữu Thọ,Phạm Văn Đồng,Quốc lộ 1A Urban,Trường Chinh

# Budget safety knobs
NON_TRAFFIC_REQ_RESERVE=3
TRAFFIC_REQ_HEADROOM_PCT=0.10

# Other APIs
OPENWEATHER_API_KEY=...
SERPAPI_KEY=...

# OpenWeather grid mode (Option C)
OWM_GRID_SIZE_M=500
OWM_GRID_MIN_CALL_INTERVAL_SEC=0.9

# Optional: Daily simulated incidents for demo dashboards
MOCK_INCIDENTS_ENABLED=false
MOCK_INCIDENTS_COUNT=5
MOCK_INCIDENTS_CRON_HOUR=5
MOCK_INCIDENTS_CRON_MINUTE=55
```

Important:

- `etl-scheduler` and `data-pipeline` must both load the same `.env`.
- After adding/removing keys, recreate both containers.
- After changing `GOLD_CORRIDOR_NAMES` or `TARGET_CORRIDOR_MIN_COVERAGE_PCT`, rebuild/recreate runtime containers so scheduler and manual runs use the same logic.

```bash
docker compose up -d --force-recreate data-pipeline etl-scheduler
```

---

## Scheduler Behavior

Scheduler source: `scheduler/app.py`

It defines:

- `REALTIME_JOB` timeout: 300s
- `BATCH_JOB` timeout: 1800s
- `KEY_HEALTHCHECK_JOB` timeout: 180s

Scheduler behavior summary:

- Realtime uses `run-realtime --budget-mode --segment-limit <SAFE_TRAFFIC_SEGMENT_LIMIT>`
- Realtime selection is quality-first and gold-corridor-only
- Batch runs immediately after realtime success
- Daily key health check runs at `05:50` VN

Windows and jobs are configured with `CronTrigger` in Asia/Ho_Chi_Minh timezone.

Useful logs:

```bash
docker compose logs --tail=100 etl-scheduler
docker compose exec etl-scheduler tail -n 100 /app/logs/real-time-etl.log
docker compose exec etl-scheduler tail -n 100 /app/logs/batch-analytics.log

# OWM grid / 429 monitoring
docker compose logs --since=24h etl-scheduler | grep -E "OWM429|Weather grid done"
```

---

## Monitoring Queries

### Last 24h Realtime Throughput

```sql
SELECT
  date_trunc('hour', created_at) AS hour_bucket,
  COUNT(*) AS rows,
  COUNT(DISTINCT segment_key) AS unique_segments
FROM fact_traffic_flow
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1 DESC;
```

### Corridor Coverage in Latest Realtime Cycle

```sql
WITH latest_cycle AS (
  SELECT MAX(created_at) AS max_ts
  FROM fact_traffic_flow
)
SELECT
  c.corridor_name,
  COUNT(DISTINCT f.segment_key) AS segments_loaded
FROM fact_traffic_flow f
JOIN bridge_corridor_segment bcs ON bcs.segment_key = f.segment_key
JOIN dim_corridor c ON c.corridor_key = bcs.corridor_key
WHERE f.created_at >= (SELECT max_ts - INTERVAL '5 minutes' FROM latest_cycle)
GROUP BY c.corridor_name
ORDER BY segments_loaded DESC;
```

### Gold Corridor Coverage Check

```sql
WITH latest_cycle AS (
  SELECT MAX(created_at) AS max_ts
  FROM fact_traffic_flow
), latest_rows AS (
  SELECT f.segment_key
  FROM fact_traffic_flow f
  WHERE f.created_at >= (SELECT max_ts - INTERVAL '5 minutes' FROM latest_cycle)
)
SELECT
  c.corridor_name,
  COUNT(DISTINCT lr.segment_key) AS segments_loaded,
  COUNT(DISTINCT bcs.segment_key) AS total_segments,
  ROUND(100.0 * COUNT(DISTINCT lr.segment_key) / NULLIF(COUNT(DISTINCT bcs.segment_key), 0), 2) AS coverage_percent
FROM dim_corridor c
JOIN bridge_corridor_segment bcs ON bcs.corridor_key = c.corridor_key
LEFT JOIN latest_rows lr ON lr.segment_key = bcs.segment_key
WHERE c.corridor_name IN (
  'Cách Mạng Tháng 8',
  'Nguyễn Văn Linh',
  'Nguyễn Hữu Thọ',
  'Phạm Văn Đồng',
  'Quốc lộ 1A Urban',
  'Trường Chinh'
)
GROUP BY c.corridor_name
ORDER BY coverage_percent DESC;
```

### Batch Output Health

```sql
SELECT
  MAX(date_key) AS latest_date_key,
  COUNT(*) AS rows,
  COUNT(DISTINCT corridor_key) AS corridors
FROM fact_corridor_performance;
```

---

## Troubleshooting

### Effective budget is lower than expected

1. Verify loaded key count:

```bash
docker compose exec data-pipeline python -c "from src.core.config import settings; print(len(settings.get_tomtom_keys()))"
```

2. Probe keys and read effective budget:

```bash
docker compose exec data-pipeline python -m src.main health-tomtom-keys
```

3. If many keys are blocked, realtime still retries the same point with the next usable key, but effective capacity drops:

```bash
docker compose exec etl-scheduler tail -n 200 /app/logs/real-time-etl.log
```

Look for:

- `Retry point (...) with next key after 403`
- many keys marked `BLOCKED` in pool status

3. Check scheduler startup log budget line:

```bash
docker compose logs etl-scheduler | grep -E "Request budget|traffic limit|key_count"
```

### Realtime rows are far below segment limit

Possible reasons:

- Some keys returned `403` and were blocked.
- TomTom endpoint transient errors for subset of points.
- Gold corridor whitelist is intentionally narrow.
- Allocator is enforcing a high minimum corridor coverage floor.

Inspect:

```bash
docker compose exec etl-scheduler tail -n 200 /app/logs/real-time-etl.log
```

### Scheduler not running a window cycle

Check current VN time and window inclusion (`06:00-21:00`).

```bash
docker compose logs --tail=120 etl-scheduler
```

---

## Development Notes

Core files:

- `src/main.py` - CLI commands and realtime segment loading logic
- `src/core/config.py` - env settings and key parsing
- `src/core/api_key_pool.py` - key rotation and blocking
- `src/pipelines/real_time/traffic_pipeline.py` - TomTom extraction using key pool
- `src/pipelines/ml_features/corridor_pipeline.py` - batch corridor aggregation with gold corridor filtering
- `scheduler/app.py` - chained scheduler and dynamic budget calculation

---

## Related Docs

- [docs/ETL_STRATEGY.md](docs/ETL_STRATEGY.md)
- [scheduler/README.md](scheduler/README.md)
- [docs/implementation](docs/implementation)

---

## License

MIT. See [../LICENSE](../LICENSE).
