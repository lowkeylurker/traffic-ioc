"""Weather Dimension Pipeline.

Extract : OpenWeatherMap Current Weather API
Transform: Validate + map severity_level
Load    : UPSERT → dim_weather (DO NOTHING – static lookup)

Trả về weather_key để Traffic pipeline sử dụng FK.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy import Engine

from src.core.config import settings
from src.core.exceptions import DataExtractionError, DataValidationError
from src.core.logger import get_logger
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer
from src.schemas.weather_schema import WeatherResponse
from src.utils.weather_mapping import get_weather_severity


# ═══════════════════════════════════════════════════════════
# EXTRACTOR
# ═══════════════════════════════════════════════════════════


class WeatherExtractor(BaseExtractor):
    """Gọi OpenWeatherMap Current Weather API."""

    BASE_URL = "https://api.openweathermap.org/data/2.5/weather"
    DEFAULT_TIMEOUT = 10
    MAX_RETRIES = 2
    RETRY_WAIT = 2

    def extract(self, **kwargs: Any) -> dict:
        """Lấy thời tiết hiện tại cho tọa độ HCM.

        Kwargs:
            lat: float (default 10.7764)
            lon: float (default 106.7011)

        Returns:
            dict: Raw JSON response.
        """
        lat = kwargs.get("lat", 10.7764)
        lon = kwargs.get("lon", 106.7011)

        params = {
            "lat": lat,
            "lon": lon,
            "appid": self.api_key,
            "units": "metric",
        }

        self.logger.info(f"Extracting weather for ({lat}, {lon})")
        return self._get(self.BASE_URL, params=params)


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class WeatherTransformer(BaseTransformer):
    """Validate + map weather data → dim_weather record."""

    def transform(self, raw_data: dict) -> list[dict]:
        """Transform raw weather JSON → list[dict] cho dim_weather.

        Returns:
            list[dict]: Thường chỉ 1 record.
        """
        try:
            validated = WeatherResponse.model_validate(raw_data)
        except ValidationError as e:
            self.logger.warning(f"Weather validation failed: {e}")
            raise DataValidationError(
                message="Weather response validation failed",
                detail=str(e),
            )

        if not validated.weather:
            self.logger.warning("Empty weather conditions list")
            return []

        condition = validated.weather[0]
        weather_id = condition.id

        record = {
            "weather_key": weather_id,
            "weather_id": weather_id,
            "main_category": condition.main,
            "severity_level": get_weather_severity(weather_id),
            "record_timestamp": datetime.utcnow(),
        }

        self.logger.info(
            f"Transformed weather: id={weather_id}, "
            f"category={condition.main}, severity={record['severity_level']}"
        )
        return [record]


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class WeatherLoader(BaseLoader):
    TABLE_NAME = "dim_weather"
    CONFLICT_KEYS = ["weather_key"]
    UPDATE_COLUMNS = []  # DO NOTHING
    BATCH_SIZE = 50

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, api_key: str = "", **kwargs) -> int:
    """Chạy ETL cho dim_weather. Trả về weather_key (FK cho traffic).

    Args:
        engine: SQLAlchemy Engine.
        api_key: OpenWeather API key (overrides config).

    Returns:
        int: weather_key (lưu ý: trả weather_key, KHÔNG phải row count).
    """
    logger = get_logger("weather_pipeline")

    key = api_key or settings.openweather_api_key

    # E
    extractor = WeatherExtractor(api_key=key)
    raw = extractor.extract(**kwargs)
    logger.info("Extracted weather data from OpenWeatherMap")

    # T
    transformer = WeatherTransformer()
    records = transformer.transform(raw)

    if not records:
        logger.warning("No weather records to load, returning default key 800")
        return 800  # Clear sky default

    # L
    loader = WeatherLoader(engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → dim_weather")

    return records[0]["weather_key"]
