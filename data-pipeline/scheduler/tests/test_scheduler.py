#!/usr/bin/env python
"""
Quick test for scheduler - runs one real-time job after 10 seconds
"""

import logging
import subprocess
import time
from apscheduler.schedulers.background import BackgroundScheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_job():
    """Run one real-time ETL."""
    logger.info("🧪 Testing real-time ETL via scheduler...")
    try:
        result = subprocess.run(
            ["docker", "exec", "data-pipeline", "python", "-m", "src.main", "run-realtime"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore',
            timeout=300
        )
        if result.returncode == 0:
            logger.info("✅ Test successful!")
            print("\n" + "="*60)
            print("Last 20 lines of output:")
            print("="*60)
            print("\n".join(result.stdout.strip().split("\n")[-20:]))
        else:
            logger.error(f"❌ Test failed: {result.stderr[:500]}")
    except Exception as e:
        logger.error(f"❌ Exception: {e}")

if __name__ == "__main__":
    logger.info("🚀 Scheduler Test - will run job in 10 seconds")
    logger.info("   Press Ctrl+C to cancel")
    
    scheduler = BackgroundScheduler()
    scheduler.add_job(test_job, 'interval', seconds=10, max_instances=1)
    scheduler.start()
    
    try:
        time.sleep(60)  # Wait 1 minute for job to complete
        logger.info("✅ Test complete")
    except KeyboardInterrupt:
        logger.info("⚠️ Test cancelled")
    finally:
        scheduler.shutdown()
