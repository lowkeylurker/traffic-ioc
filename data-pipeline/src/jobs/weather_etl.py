from __future__ import annotations

import time
from src.core.database import get_engine
from src.pipelines.real_time.weather_pipeline import run as run_weather
from src.core.logger import get_logger

logger = get_logger("weather_etl")

def run_etl():
    """Run ETL Weather: create engine + run pipeline."""
    try:
        engine = get_engine()
        # weather_pipeline.run trả về weather_key
        weather_key = run_weather(engine)
        logger.info(f"Weather ETL cycle complete. Current weather_key: {weather_key}")
        return weather_key
    except Exception as e:
        logger.error(f"Weather ETL cycle failed: {e}")
        return None
