#!/usr/bin/env python
"""
ETL Scheduler for Traffic IoC Data Pipeline.

Manages periodic execution of:
- Real-time ETL: Every 15 minutes (weather → traffic → incidents)  [Quận 1 corridors only]
- Batch Analytics: Runs immediately after each successful real-time ETL [Q1 corridors]

**OFFICIAL Q1 MODE (Mar 2026)**: 
- run-realtime uses target_corridor_mode for ~920 segments in Quận 1
- run-batch runs baseline (all segments) + corridor perf (Quận 1 only)
- Batch always runs after realtime completes successfully

Usage:
    python app.py
    
Environment:
    DB_CONNECTION_STRING: PostgreSQL connection string
    LOG_LEVEL: DEBUG, INFO, WARNING, ERROR (default: INFO)
"""

import logging
import logging.handlers
from datetime import timezone, timedelta
import os
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

# ═══════════════════════════════════════════════════════════
# LOGGING SETUP
# ═══════════════════════════════════════════════════════════

LOG_DIR = Path("/app/logs")
LOG_DIR.mkdir(exist_ok=True)
VN_TZ = timezone(timedelta(hours=7))
RUN_ON_START = os.getenv("RUN_ON_START", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# ── Request budget: auto-compute from API key pool size ────────────────────
# Default ETL schedule: 06:00-21:00 every 15 minutes (inclusive 21:00) = 61 cycles/day.
_CYCLES_PER_DAY = max(1, int(os.getenv("ETL_ACTIVE_CYCLES_PER_DAY", "61")))
_tomtom_keys_env = os.getenv("TOMTOM_API_KEYS", os.getenv("TOMTOM_API_KEY", ""))
_tomtom_key_count = max(1, len([k for k in _tomtom_keys_env.split(",") if k.strip()]))
TOMTOM_DAILY_LIMIT_PER_KEY = int(os.getenv("TOMTOM_DAILY_LIMIT_PER_KEY", "2500"))
# Per-cycle ceiling from pool (overrideable by REQ_BUDGET_PER_CYCLE env var)
_auto_budget = _tomtom_key_count * TOMTOM_DAILY_LIMIT_PER_KEY // _CYCLES_PER_DAY
REQ_BUDGET_PER_CYCLE = int(os.getenv("REQ_BUDGET_PER_CYCLE", str(_auto_budget)))
NON_TRAFFIC_REQ_RESERVE = int(os.getenv("NON_TRAFFIC_REQ_RESERVE", "3"))
TRAFFIC_REQ_HEADROOM_PCT = float(os.getenv("TRAFFIC_REQ_HEADROOM_PCT", "0.10"))
_traffic_budget_raw = max(1, REQ_BUDGET_PER_CYCLE - NON_TRAFFIC_REQ_RESERVE)
SAFE_TRAFFIC_SEGMENT_LIMIT = max(
    1,
    int(_traffic_budget_raw * (1.0 - max(0.0, min(0.5, TRAFFIC_REQ_HEADROOM_PCT)))),
)


class VietnamTimeFormatter(logging.Formatter):
    """Force log timestamps to Asia/Ho_Chi_Minh (UTC+7)."""

    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, tz=VN_TZ)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.strftime("%Y-%m-%d %H:%M:%S,%f")[:-3]

def setup_logging():
    """Configure logging to file and console."""
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_formatter = VietnamTimeFormatter(
        "[%(levelname)s] %(asctime)s - %(name)s - %(message)s"
    )
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)
    
    # File handler
    file_handler = logging.handlers.RotatingFileHandler(
        LOG_DIR / "scheduler.log",
        maxBytes=10485760,  # 10 MB
        backupCount=5
    )
    file_handler.setLevel(logging.DEBUG)
    file_formatter = VietnamTimeFormatter(
        "[%(levelname)s] %(asctime)s - %(name)s - %(message)s"
    )
    file_handler.setFormatter(file_formatter)
    root_logger.addHandler(file_handler)
    
    return logging.getLogger(__name__)

logger = setup_logging()


def is_within_etl_window(now: datetime | None = None) -> bool:
    """Return True if current Vietnam local time is inside allowed ETL windows.

    Window:
    - 06:00 to 21:00 (inclusive at 21:00 only)
    """
    current = now or datetime.now(VN_TZ)
    hhmm = current.hour * 60 + current.minute

    start_h = int(os.getenv("ETL_WINDOW_START_HOUR", "6"))
    end_h = int(os.getenv("ETL_WINDOW_END_HOUR", "21"))
    window_start = start_h * 60
    window_end = end_h * 60
    return window_start <= hhmm <= window_end

# ═══════════════════════════════════════════════════════════
# ETL COMMANDS
# ═══════════════════════════════════════════════════════════

class ETLJob:
    """Wrapper for ETL command execution."""
    
    def __init__(self, name: str, command: list, timeout: int):
        """
        Args:
            name: Job name for logging
            command: Command to execute (list)
            timeout: Max execution time in seconds
        """
        self.name = name
        self.command = command
        self.timeout = timeout
        self.log_file = LOG_DIR / f"{name.lower().replace(' ', '-')}.log"
        self.last_success = False  # Track if last run was successful
    
    def run(self, cycle_id: str | None = None) -> dict:
        """Execute the ETL command and return structured result."""
        cycle_prefix = f"[{cycle_id}] " if cycle_id else ""
        logger.info(f"{cycle_prefix}[{self.name}] START")
        start_time = time.time()
        started_at = datetime.utcnow().isoformat() + "Z"
        
        try:
            result = subprocess.run(
                self.command,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='ignore',  # Ignore Unicode errors on Windows
                timeout=self.timeout
            )
            
            elapsed = time.time() - start_time
            stdout_tail = (result.stdout or "")[-1200:]
            stderr_tail = (result.stderr or "")[-1200:]
            
            # Log output
            with open(self.log_file, "a") as f:
                f.write(f"\n{'='*80}\n")
                f.write(f"Run at: {datetime.now().isoformat()}\n")
                f.write(f"Return code: {result.returncode}\n")
                f.write(f"Duration: {elapsed:.1f}s\n")
                f.write(f"{'='*80}\n")
                if result.stdout:
                    f.write(result.stdout)
                if result.stderr:
                    f.write(result.stderr)
            
            success = result.returncode == 0
            self.last_success = success

            if success:
                logger.info(
                    f"{cycle_prefix}[{self.name}] SUCCESS "
                    f"(exit=0, duration={elapsed:.1f}s, log={self.log_file.name})"
                )
            else:
                logger.error(
                    f"{cycle_prefix}[{self.name}] FAIL "
                    f"(exit={result.returncode}, duration={elapsed:.1f}s, log={self.log_file.name})"
                )
                if stderr_tail:
                    logger.error(f"{cycle_prefix}[{self.name}] stderr tail:\n{stderr_tail}")
                elif stdout_tail:
                    logger.error(f"{cycle_prefix}[{self.name}] stdout tail:\n{stdout_tail}")

            return {
                "job": self.name,
                "success": success,
                "exit_code": result.returncode,
                "duration_sec": round(elapsed, 1),
                "started_at": started_at,
                "finished_at": datetime.utcnow().isoformat() + "Z",
                "log_file": str(self.log_file),
            }
        
        except subprocess.TimeoutExpired:
            elapsed = time.time() - start_time
            logger.error(
                f"{cycle_prefix}[{self.name}] TIMEOUT (>{self.timeout}s, duration={elapsed:.1f}s)"
            )
            self.last_success = False
            return {
                "job": self.name,
                "success": False,
                "exit_code": None,
                "duration_sec": round(elapsed, 1),
                "started_at": started_at,
                "finished_at": datetime.utcnow().isoformat() + "Z",
                "log_file": str(self.log_file),
                "error": "timeout",
            }
        
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(
                f"{cycle_prefix}[{self.name}] EXCEPTION: {e} (duration={elapsed:.1f}s)"
            )
            self.last_success = False
            return {
                "job": self.name,
                "success": False,
                "exit_code": None,
                "duration_sec": round(elapsed, 1),
                "started_at": started_at,
                "finished_at": datetime.utcnow().isoformat() + "Z",
                "log_file": str(self.log_file),
                "error": str(e),
            }


# Job definitions
REALTIME_JOB = ETLJob(
    name="Real-time ETL",
    command=[
        "docker",
        "exec",
        "data-pipeline",
        "python",
        "-m",
        "src.main",
        "run-realtime",
        "--budget-mode",
        "--segment-limit",
        str(SAFE_TRAFFIC_SEGMENT_LIMIT),
    ],
    timeout=300  # 5 minutes
)

BATCH_JOB = ETLJob(
    name="Batch Analytics",
    command=["docker", "exec", "data-pipeline", "python", "-m", "src.main", "run-batch"],
    timeout=1800  # 30 minutes
)

KEY_HEALTHCHECK_JOB = ETLJob(
    name="TomTom Key Healthcheck",
    command=[
        "docker",
        "exec",
        "data-pipeline",
        "python",
        "-m",
        "src.main",
        "health-tomtom-keys",
    ],
    timeout=180,  # 3 minutes
)

# ═══════════════════════════════════════════════════════════
# CHAINED JOB EXECUTION
# ═══════════════════════════════════════════════════════════

def run_realtime_then_batch():
    """Run realtime ETL, then immediately run batch if successful."""
    cycle_id = datetime.utcnow().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    logger.info("=" * 80)
    logger.info(f"[{cycle_id}] CYCLE START: Realtime -> Batch")
    logger.info("=" * 80)
    
    try:
        # Run realtime
        logger.info(f"[{cycle_id}] Step 1/2: run-realtime")
        realtime_result = REALTIME_JOB.run(cycle_id=cycle_id)
        realtime_success = bool(realtime_result.get("success"))
        
        # If realtime succeeded, run batch immediately
        if realtime_success:
            logger.info(f"[{cycle_id}] Realtime success -> trigger batch immediately")
            time.sleep(2)  # Short pause between jobs
            logger.info(f"[{cycle_id}] Step 2/2: run-batch")
            batch_result = BATCH_JOB.run(cycle_id=cycle_id)

            if batch_result.get("success"):
                logger.info(
                    f"[{cycle_id}] CYCLE SUCCESS "
                    f"(realtime={realtime_result.get('duration_sec')}s, "
                    f"batch={batch_result.get('duration_sec')}s)"
                )
            else:
                logger.error(
                    f"[{cycle_id}] CYCLE PARTIAL FAIL "
                    f"(realtime=OK, batch=FAIL, batch_log={batch_result.get('log_file')})"
                )
        else:
            logger.warning(
                f"[{cycle_id}] CYCLE FAIL (realtime failed -> batch skipped, "
                f"realtime_log={realtime_result.get('log_file')})"
            )
    except Exception as e:
        logger.error(f"[{cycle_id}] CYCLE EXCEPTION: {e}", exc_info=True)
    finally:
        logger.info(f"[{cycle_id}] CYCLE END")


def run_daily_key_healthcheck():
    """Run TomTom key health-check once per day for observability."""
    cycle_id = "daily-health-" + datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    logger.info("=" * 80)
    logger.info(f"[{cycle_id}] DAILY TOMTOM KEY HEALTHCHECK START")
    logger.info("=" * 80)
    result = KEY_HEALTHCHECK_JOB.run(cycle_id=cycle_id)
    if result.get("success"):
        logger.info(
            f"[{cycle_id}] DAILY TOMTOM KEY HEALTHCHECK SUCCESS "
            f"(duration={result.get('duration_sec')}s)"
        )
    else:
        logger.error(
            f"[{cycle_id}] DAILY TOMTOM KEY HEALTHCHECK FAIL "
            f"(log={result.get('log_file')})"
        )
    logger.info(f"[{cycle_id}] DAILY TOMTOM KEY HEALTHCHECK END")

# ═══════════════════════════════════════════════════════════
# SCHEDULER SETUP
# ═══════════════════════════════════════════════════════════

def setup_scheduler():
    """Configure and start the APScheduler."""
    scheduler = BackgroundScheduler(timezone=VN_TZ)

    start_h = int(os.getenv("ETL_WINDOW_START_HOUR", "6"))
    end_h = int(os.getenv("ETL_WINDOW_END_HOUR", "21"))

    # Main ETL window: start_h:00 to (end_h-1):45 every 15 minutes
    scheduler.add_job(
        run_realtime_then_batch,
        trigger=CronTrigger(hour=f"{start_h}-{max(start_h, end_h - 1)}", minute="0,15,30,45", timezone=VN_TZ),
        id='etl-chained-main-window',
        name=f'Chained ETL ({start_h:02d}:00-{end_h:02d}:00)',
        coalesce=True,      # Skip if previous still running
        max_instances=1,    # Only 1 instance at a time
        misfire_grace_time=60  # Allow 1 min late start
    )

    # Boundary slot: end_h:00
    scheduler.add_job(
        run_realtime_then_batch,
        trigger=CronTrigger(hour=str(end_h), minute="0", timezone=VN_TZ),
        id='etl-chained-boundary',
        name=f'Chained ETL (Boundary {end_h:02d}:00)',
        coalesce=True,      # Skip if previous still running
        max_instances=1,    # Only 1 instance at a time
        misfire_grace_time=60  # Allow 1 min late start
    )

    # Daily key health-check at 05:50 (before morning ETL window)
    scheduler.add_job(
        run_daily_key_healthcheck,
        trigger=CronTrigger(hour="5", minute="50", timezone=VN_TZ),
        id='tomtom-key-healthcheck-daily',
        name='TomTom Key Healthcheck (Daily 05:50)',
        coalesce=True,
        max_instances=1,
        misfire_grace_time=300,
    )

    next_runs = []
    for job in scheduler.get_jobs():
        next_run = getattr(job, "next_run_time", None)
        if next_run is None:
            next_run = getattr(job, "next_fire_time", None)
        next_runs.append((job.id, next_run))

    next_runs.sort(key=lambda item: item[1] or datetime.max.replace(tzinfo=VN_TZ))
    nearest_run = next_runs[0][1] if next_runs else None
    
    # Print schedule info
    logger.info("=" * 80)
    logger.info("🚀 ETL SCHEDULER INITIALIZED (Auto-Start Mode)")
    logger.info("=" * 80)
    logger.info("📅 Scheduled Jobs:")
    logger.info("  1. Chained ETL (Realtime → Batch)")
    logger.info("     ⏱️  Frequency: Every 15 minutes (within time windows)")
    logger.info(
        "     🕒 Window (Asia/Ho_Chi_Minh): %02d:00-%02d:00",
        start_h,
        end_h,
    )
    logger.info("     ⏱️  Timeout: 5 min (realtime) + 30 min (batch)")
    logger.info("     📦 Pipeline:")
    logger.info(
        "        → Real-time: Weather → Traffic Flow (budget-capped) → Incidents"
    )
    logger.info(
        "        → Request budget: "
        f"{REQ_BUDGET_PER_CYCLE}/cycle, traffic limit={SAFE_TRAFFIC_SEGMENT_LIMIT} segments"
    )
    logger.info("        → Batch: Baseline Speed (All) + Corridor Performance (Q1)")
    logger.info("     ✨ Batch runs IMMEDIATELY after realtime completes successfully")
    logger.info("  2. TomTom Key Healthcheck")
    logger.info("     ⏱️  Frequency: Daily at 05:50 (Asia/Ho_Chi_Minh)")
    logger.info("     📦 Output: usable_keys, blocked_keys, effective_budget/cycle")
    logger.info(f"     🕒 Next scheduled run: {nearest_run or 'available after scheduler starts'}")
    logger.info(f"     ⚡ Run on startup: {'enabled' if RUN_ON_START else 'disabled'}")
    logger.info("")
    logger.info(f"📝 Logs: {LOG_DIR}")
    logger.info("🔎 Failure diagnosis order:")
    logger.info("    1) /app/logs/scheduler.log")
    logger.info("    2) /app/logs/real-time-etl.log")
    logger.info("    3) /app/logs/batch-analytics.log")
    logger.info("=" * 80)
    
    return scheduler

# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    try:
        scheduler = setup_scheduler()
        scheduler.start()

        if RUN_ON_START:
            if is_within_etl_window():
                logger.info("⚡ Startup is within ETL window -> triggering immediate ETL cycle...")
                threading.Thread(
                    target=run_realtime_then_batch,
                    name="startup-etl-cycle",
                    daemon=True,
                ).start()
            else:
                logger.info(
                    "⏭️ Startup is outside ETL window (%02d:00-%02d:00) -> skip immediate run",
                    int(os.getenv("ETL_WINDOW_START_HOUR", "6")),
                    int(os.getenv("ETL_WINDOW_END_HOUR", "21")),
                )
        
        logger.info("✅ Scheduler running. Press Ctrl+C to stop.")
        
        # Keep running
        while True:
            time.sleep(1)
    
    except KeyboardInterrupt:
        logger.info("⚠️  Shutdown signal received...")
        scheduler.shutdown()
        logger.info("✅ Scheduler stopped gracefully")
        sys.exit(0)
    
    except Exception as e:
        logger.critical(f"❌ Fatal error: {e}", exc_info=True)
        sys.exit(1)
