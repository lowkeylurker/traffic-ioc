# OpenWeatherMap (OWM) Operations Guide

## 1. Scope

This document describes how OWM is used in `data-pipeline` realtime ETL after switching to grid mode (Option C).

Current policy:
- Keep **one OWM key**.
- Use **grid weather sampling** with `OWM_GRID_SIZE_M=500`.
- Throttle OWM calls with `OWM_GRID_MIN_CALL_INTERVAL_SEC` (recommended `0.8-1.1`, default `0.9`).
- Monitor `429` for 1-2 days before deciding whether to add keys.

---

## 2. Where OWM Is Used

- Weather extraction endpoint:
  - `https://api.openweathermap.org/data/2.5/weather`
- Runtime integration:
  - `run-realtime` loads selected segment points first.
  - Points are grouped into active 500m grid cells.
  - ETL calls OWM once per active cell center.
  - Each segment receives weather from its own grid cell.
  - `fact_traffic_flow.weather_key` is now assigned per segment (not one weather key for whole cycle).

Related files:
- `src/pipelines/real_time/weather_pipeline.py`
- `src/pipelines/real_time/traffic_pipeline.py`
- `src/main.py`

---

## 3. Runtime Config

Set from compose/env:

```dotenv
OWM_GRID_SIZE_M=500
OWM_GRID_MIN_CALL_INTERVAL_SEC=0.9
```

Recommended values:
- `OWM_GRID_SIZE_M=500` for good accuracy/cost balance.
- `OWM_GRID_MIN_CALL_INTERVAL_SEC=0.9` to reduce burst risk against per-minute limits.

If you need faster runs:
- Reduce interval toward `0.8`.

If you see frequent `429`:
- Increase interval toward `1.1` or higher before adding keys.

---

## 4. Capacity and Call Budget

Given current ETL schedule:
- 61 realtime cycles/day (06:00-21:00 every 15 minutes, inclusive at 21:00).

Given measured 500m grid in current target set:
- About 220 active cells/cycle.

Estimated OWM usage:
- `220 x 61 = 13,420 calls/day`
- `~402,600 calls/month`

This is typically well below the free Current Weather monthly allowance.

---

## 5. Monitoring 429

### 5.1 Key log markers

The weather grid pipeline emits:
- `OWM429: rate limit hit for cell=...`
- `Weather grid done: ... owm_429_cells=<n> ...`

### 5.2 Check recent scheduler logs

```powershell
docker compose logs --since=48h etl-scheduler | Select-String "OWM429|Weather grid done"
```

### 5.3 Count 429 events in 24h

```powershell
docker compose logs --since=24h etl-scheduler | Select-String "OWM429" | Measure-Object -Line
```

Interpretation:
- `0-5/day`: healthy.
- `>5/day`: increase interval (e.g. 0.9 -> 1.1).
- still high after interval tuning: then consider adding another OWM key.

---

## 6. Operational Playbook (1-2 Days)

Day 1:
1. Keep one key.
2. Run with `OWM_GRID_SIZE_M=500`, `OWM_GRID_MIN_CALL_INTERVAL_SEC=0.9`.
3. Collect 24h `OWM429` count.

Day 2:
1. If 429 count is acceptable, keep current settings.
2. If frequent 429, tune interval to `1.1` and observe another 24h.
3. Only if still frequent after throttling, add another key.

---

## 7. Change Procedure

After changing OWM runtime env:

```bash
docker compose up -d --force-recreate data-pipeline etl-scheduler
```

Quick verification:

```bash
docker compose exec data-pipeline python -m src.main run-realtime --budget-mode --segment-limit 100
```

Expect logs containing:
- `Weather grid mode: grid_size=500m, active_cells=...`
- `Weather grid done: ... owm_429_cells=...`

---

## 8. Troubleshooting

### Problem: No weather diversity in one cycle

Check:
- `active_cells` in weather grid logs.
- If active cells are very low, segment selection may be geographically concentrated.

### Problem: Frequent 429

Actions:
1. Increase `OWM_GRID_MIN_CALL_INTERVAL_SEC`.
2. Recreate containers.
3. Re-check 24h logs.
4. Add key only if still frequent.

### Problem: ETL slower than expected

Actions:
1. Lower interval carefully (`1.1 -> 0.9 -> 0.8`).
2. Keep monitoring 429.
