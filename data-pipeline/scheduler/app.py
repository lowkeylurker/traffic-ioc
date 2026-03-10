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
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

# ═══════════════════════════════════════════════════════════
# LOGGING SETUP
# ═══════════════════════════════════════════════════════════

LOG_DIR = Path("/app/logs")
LOG_DIR.mkdir(exist_ok=True)

def setup_logging():
    """Configure logging to file and console."""
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter(
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
    file_formatter = logging.Formatter(
        "[%(levelname)s] %(asctime)s - %(name)s - %(message)s"
    )
    file_handler.setFormatter(file_formatter)
    root_logger.addHandler(file_handler)
    
    return logging.getLogger(__name__)

logger = setup_logging()

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
    
    def run(self):
        """Execute the ETL command."""
        logger.info(f"[{self.name}] ⏳ Starting...")
        start_time = time.time()
        
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
            
            if result.returncode == 0:
                logger.info(
                    f"[{self.name}] ✅ Completed in {elapsed:.1f}s"
                )
                self.last_success = True
                return True  # Return success status
            else:
                logger.error(
                    f"[{self.name}] ❌ Failed (exit={result.returncode}) "
                    f"in {elapsed:.1f}s\n{result.stderr[:200]}"
                )
                self.last_success = False
                return False
        
        except subprocess.TimeoutExpired:
            elapsed = time.time() - start_time
            logger.error(
                f"[{self.name}] ❌ Timeout (>{self.timeout}s after {elapsed:.1f}s)"
            )
            self.last_success = False
            return False
        
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(
                f"[{self.name}] ❌ Exception: {e} (after {elapsed:.1f}s)"
            )
            self.last_success = False
            return False


# Job definitions
REALTIME_JOB = ETLJob(
    name="Real-time ETL",
    command=["docker", "exec", "data-pipeline", "python", "-m", "src.main", "run-realtime"],
    timeout=300  # 5 minutes
)

BATCH_JOB = ETLJob(
    name="Batch Analytics",
    command=["docker", "exec", "data-pipeline", "python", "-m", "src.main", "run-batch"],
    timeout=1800  # 30 minutes
)

# ═══════════════════════════════════════════════════════════
# CHAINED JOB EXECUTION
# ═══════════════════════════════════════════════════════════

def run_realtime_then_batch():
    """Run realtime ETL, then immediately run batch if successful."""
    logger.info("🔗 Starting chained job: Realtime → Batch")
    
    try:
        # Run realtime
        logger.info("▶️  Executing realtime ETL...")
        realtime_success = REALTIME_JOB.run()
        logger.info(f"[Realtime Result] Success: {realtime_success}")
        
        # If realtime succeeded, run batch immediately
        if realtime_success:
            logger.info("✅ Realtime succeeded, starting batch analytics immediately...")
            time.sleep(2)  # Short pause between jobs
            logger.info("▶️  Executing batch ETL...")
            BATCH_JOB.run()
            logger.info("✅ Batch analytics completed")
        else:
            logger.warning("⚠️ Realtime failed, skipping batch analytics")
    except Exception as e:
        logger.error(f"❌ Chained job exception: {e}", exc_info=True)

# ═══════════════════════════════════════════════════════════
# SCHEDULER SETUP
# ═══════════════════════════════════════════════════════════

def setup_scheduler():
    """Configure and start the APScheduler."""
    scheduler = BackgroundScheduler()
    
    # Chained job: Real-time + Batch (every 15 minutes)
    scheduler.add_job(
        run_realtime_then_batch,
        trigger=IntervalTrigger(minutes=15),
        id='etl-chained',
        name='Chained ETL (Realtime → Batch)',
        coalesce=True,      # Skip if previous still running
        max_instances=1,    # Only 1 instance at a time
        misfire_grace_time=60  # Allow 1 min late start
    )
    
    # Print schedule info
    logger.info("=" * 80)
    logger.info("🚀 ETL SCHEDULER INITIALIZED (Auto-Start Mode)")
    logger.info("=" * 80)
    logger.info("📅 Scheduled Jobs:")
    logger.info("  1. Chained ETL (Realtime → Batch)")
    logger.info("     ⏱️  Frequency: Every 15 minutes")
    logger.info("     ⏱️  Timeout: 5 min (realtime) + 30 min (batch)")
    logger.info("     📦 Pipeline:")
    logger.info("        → Real-time: Weather → Traffic Flow (~920 Q1 segments) → Incidents")
    logger.info("        → Batch: Baseline Speed (All) + Corridor Performance (Q1)")
    logger.info("     ✨ Batch runs IMMEDIATELY after realtime completes successfully")
    logger.info("")
    logger.info(f"📝 Logs: {LOG_DIR}")
    logger.info("=" * 80)
    
    return scheduler

# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    try:
        scheduler = setup_scheduler()
        scheduler.start()
        
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
