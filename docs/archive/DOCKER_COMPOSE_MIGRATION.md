# Docker Compose Unification - Migration Guide

## Summary

The project now uses a **single unified `docker-compose.yml`** file instead of two separate files. The scheduler has been updated to run batch ETL immediately after realtime ETL completes successfully.

## Key Changes

### 1. File Consolidation

**Before:**
- `docker-compose.yml` - Development mode (manual ETL)
- `docker-compose.scheduler.yml` - Production mode (automated ETL)

**After:**
- `docker-compose.yml` - Unified configuration with profiles
- `infrastructure/docker/backups/docker-compose.scheduler.yml.backup` - Backup of old file

### 2. Auto-Start Behavior

When you open Docker Desktop, these services **automatically start**:

✅ **postgres** - Data warehouse (restart: always)  
✅ **data-pipeline** - ETL container (restart: always)  
✅ **etl-scheduler** - Automated jobs (restart: always)  
✅ **ai-core** - ML/AI service (restart: unless-stopped)

### 3. Scheduler Behavior Changed

**Before:**
- Real-time ETL: Every 15 minutes
- Batch Analytics: Daily at 2:00 AM UTC

**After:**
- **Chained ETL**: Every 15 minutes
  1. Run real-time ETL (weather → traffic → incidents)
  2. **If successful**, immediately run batch analytics
  3. If failed, skip batch and wait for next cycle

### 4. Optional Services (Profiles)

Optional services can be enabled with profiles:

```bash
# Core services only (default)
docker-compose up -d

# Include backend + frontend
docker-compose --profile fullstack up -d

# Include Redis caching
docker-compose --profile with-redis up -d

# All services
docker-compose --profile fullstack --profile with-redis up -d
```

## Usage

### Start Services

```bash
# Default: Core + Scheduler (auto-start when Docker Desktop opens)
docker-compose up -d

# Watch scheduler logs
docker-compose logs -f etl-scheduler

# Manual ETL trigger (if needed)
docker-compose exec data-pipeline python -m src.main run-realtime
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop but keep data
docker-compose stop
```

### View Logs

```bash
# Scheduler logs (real-time)
docker-compose logs -f etl-scheduler

# Data pipeline logs
docker-compose logs -f data-pipeline

# All logs
docker-compose logs -f
```

## Service Restart Policies

| Service | Restart Policy | Auto-Start | Purpose |
|---------|---------------|------------|---------|
| postgres | `always` | ✅ Yes | Data warehouse required for ETL |
| data-pipeline | `always` | ✅ Yes | Container for scheduler to exec ETL commands |
| etl-scheduler | `always` | ✅ Yes | Runs automated ETL jobs every 15 min |
| ai-core | `unless-stopped` | ✅ Yes | ML/AI forecasting service |
| backend | `unless-stopped` | ❌ No (profile) | Express.js API |
| frontend | `unless-stopped` | ❌ No (profile) | React web app |
| redis | `unless-stopped` | ❌ No (profile) | Optional caching |

## Benefits

✅ **Single Source of Truth** - One file to manage all services  
✅ **Auto-Start** - Services run automatically when Docker Desktop starts  
✅ **Batch After Realtime** - No waiting until 2 AM for batch jobs  
✅ **Flexible Profiles** - Easy to enable/disable optional services  
✅ **Simpler Maintenance** - Less configuration duplication  

## Migration Checklist

- [x] Backup old `docker-compose.scheduler.yml`
- [x] Merge configurations into unified `docker-compose.yml`
- [x] Add restart policies for auto-start
- [x] Update scheduler to chain realtime → batch
- [x] Test services startup
- [ ] Update CI/CD pipelines (if any)
- [ ] Update deployment documentation

## Rollback (if needed)

The old configuration is backed up in `infrastructure/docker/backups/docker-compose.scheduler.yml.backup`:

```bash
# Restore old file
cp infrastructure/docker/backups/docker-compose.scheduler.yml.backup docker-compose.scheduler.yml

# Use old scheduler
docker-compose -f docker-compose.scheduler.yml up -d
```

## Testing

### 1. Test Auto-Start

```bash
# Stop all containers
docker-compose down

# Restart Docker Desktop
# Services should automatically start

# Verify
docker-compose ps
```

### 2. Test Scheduler

```bash
# Watch scheduler logs
docker-compose logs -f etl-scheduler

# Expected output:
# [INFO] 🚀 ETL SCHEDULER INITIALIZED (Auto-Start Mode)
# [INFO] 📅 Scheduled Jobs:
# [INFO]   1. Chained ETL (Realtime → Batch)
# [INFO]      ⏱️  Frequency: Every 15 minutes
```

### 3. Test Manual ETL

```bash
# Trigger manual ETL
docker-compose exec data-pipeline python -m src.main run-realtime

# Check database
docker-compose exec postgres psql -U traffic_user -d traffic_ioc \
  -c "SELECT COUNT(*) FROM fact_traffic_flow WHERE created_at > NOW() - INTERVAL '30 minutes';"
```

## Troubleshooting

### Services not auto-starting?

```bash
# Check restart policies
docker inspect postgres | grep -A 5 RestartPolicy
docker inspect etl-scheduler | grep -A 5 RestartPolicy
```

### Scheduler not running jobs?

```bash
# Check scheduler logs
docker-compose logs etl-scheduler

# Check if data-pipeline is running
docker-compose ps data-pipeline

# Manual test
docker-compose exec etl-scheduler python -c "import subprocess; print(subprocess.run(['docker', 'ps'], capture_output=True, text=True).stdout)"
```

### Batch not running after realtime?

```bash
# Check scheduler logs for "Chained ETL"
docker-compose logs etl-scheduler | grep "Chained"

# Look for success/failure messages
docker-compose logs etl-scheduler | grep "✅\|❌"
```

---

**Date:** March 10, 2026  
**Impact:** Medium (behavioral change in scheduler)  
**Rollback:** Available via `.backup` file
