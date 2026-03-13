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
- Auto-computes request budget from key count (`N_keys x 2500 / 34 cycles`).
- Writes realtime facts (`fact_traffic_flow`, `fact_incident`) and batch metrics (`fact_corridor_performance`).
- Runs as chained scheduler jobs: realtime first, then batch immediately on success.

Current design target is Quận 1 priority corridors with budget-gated selection that scales up to full-coverage mode when key pool is large enough.

---

## Runtime Model

### ETL Windows

- Morning: `06:00-10:00` (VN time, inclusive at `10:00`)
- Evening: `16:00-20:00` (VN time, inclusive at `20:00`)
- Frequency: every 15 minutes inside windows
- Total active cycles/day: `34`

### Chained Execution

At each cycle:

1. `run-realtime --budget-mode --segment-limit <SAFE_TRAFFIC_SEGMENT_LIMIT>`
2. If realtime succeeds, run `run-batch` immediately

There is also a daily key health check at `05:50` VN:

- `python -m src.main health-tomtom-keys`
- Reports: `usable_keys`, `blocked_keys`, `effective_budget/cycle`, `safe_traffic_segment_limit/cycle`

---

## Budget Strategy

### Formula

Budget is auto-computed in scheduler and CLI startup:

- `budget_per_cycle = (N_keys x TOMTOM_DAILY_LIMIT_PER_KEY) / 34`
- `safe_traffic_segment_limit = (budget_per_cycle - NON_TRAFFIC_REQ_RESERVE) x (1 - TRAFFIC_REQ_HEADROOM_PCT)`

Default reserve/headroom:

- `NON_TRAFFIC_REQ_RESERVE=3`
- `TRAFFIC_REQ_HEADROOM_PCT=0.10`

### Capacity Reference

| Keys | Daily Budget | Budget/Cycle | Safe Segments/Cycle |
|------|--------------|--------------|----------------------|
| 1 | 2,500 | ~73 | ~63 |
| 3 | 7,500 | ~220 | ~192 |
| 5 | 12,500 | ~367 | ~327 |
| 6 | 15,000 | ~441 | ~394 |
| 10 | 25,000 | ~735 | ~656 |
| 20 | 50,000 | ~1,470 | ~1,323 |

Notes:

- For large pools (>=10 keys), runtime behaves close to full-coverage because each corridor can fit within cycle budget.
- Segment selection in `run-realtime` scales corridor quotas dynamically with the provided limit.

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
| `run-batch` | Batch analytics (baseline + corridor performance) |
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

# Budget safety knobs
NON_TRAFFIC_REQ_RESERVE=3
TRAFFIC_REQ_HEADROOM_PCT=0.10

# Other APIs
OPENWEATHER_API_KEY=...
SERPAPI_KEY=...
```

Important:

- `etl-scheduler` and `data-pipeline` must both load the same `.env`.
- After adding/removing keys, recreate both containers.

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

Windows and jobs are configured with `CronTrigger` in Asia/Ho_Chi_Minh timezone.

Useful logs:

```bash
docker compose logs --tail=100 etl-scheduler
docker compose exec etl-scheduler tail -n 100 /app/logs/real-time-etl.log
docker compose exec etl-scheduler tail -n 100 /app/logs/batch-analytics.log
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

3. Check scheduler startup log budget line:

```bash
docker compose logs etl-scheduler | grep -E "Request budget|traffic limit|key_count"
```

### Realtime rows are far below segment limit

Possible reasons:

- Some keys returned `403` and were blocked.
- TomTom endpoint transient errors for subset of points.
- Selected critical candidates did not produce valid deduped points.

Inspect:

```bash
docker compose exec etl-scheduler tail -n 200 /app/logs/real-time-etl.log
```

### Scheduler not running a window cycle

Check current VN time and window inclusion (`06:00-10:00`, `16:00-20:00`).

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
- `scheduler/app.py` - chained scheduler and dynamic budget calculation

---

## Related Docs

- [docs/ETL_STRATEGY.md](docs/ETL_STRATEGY.md)
- [scheduler/README.md](scheduler/README.md)
- [docs/implementation](docs/implementation)

---

## License

MIT. See [../LICENSE](../LICENSE).
