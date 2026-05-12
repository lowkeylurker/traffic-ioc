"""Weather Dimension Pipeline.

Extract : OpenWeatherMap Current Weather API
Transform: Validate + map severity_level
Load    : UPSERT → dim_weather (DO NOTHING – static lookup)

Trả về weather_key để Traffic pipeline sử dụng FK.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import math
import os
import time
from typing import Any

from pydantic import ValidationError
import requests
from sqlalchemy import Engine

from src.core.config import settings
from src.core.exceptions import DataExtractionError, DataValidationError
from src.core.logger import get_logger
from src.domain.weather import get_weather_severity
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer
from src.schemas.weather_schema import WeatherResponse


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
            "lang": "vi",  # Trả về description bằng tiếng Việt
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

        # Convert Unix timestamp to datetime UTC
        record_timestamp = datetime.fromtimestamp(validated.dt, tz=None).replace(tzinfo=None)

        record = {
            "weather_key": weather_id,
            "weather_id": weather_id,
            "name": condition.description or condition.main,
            "main_category": condition.main,
            "severity_level": get_weather_severity(weather_id),
            "record_timestamp": record_timestamp,
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
    UPDATE_COLUMNS = ["name", "main_category", "severity_level", "record_timestamp"]
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


def _project_to_web_mercator(lat: float, lon: float) -> tuple[float, float]:
    """Project WGS84 lat/lon to Web Mercator meters."""
    r = 6378137.0
    lat = max(-85.05112878, min(85.05112878, lat))
    x = r * math.radians(lon)
    y = r * math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0))
    return x, y


def _project_from_web_mercator(x: float, y: float) -> tuple[float, float]:
    """Project Web Mercator meters back to WGS84 lat/lon."""
    r = 6378137.0
    lon = math.degrees(x / r)
    lat = math.degrees(2.0 * math.atan(math.exp(y / r)) - math.pi / 2.0)
    return lat, lon


def run_grid_for_points(
    engine: Engine,
    points: list[tuple[float, float]],
    *,
    grid_size_m: int = 500,
    api_key: str = "",
) -> dict[tuple[float, float], int]:
    """Fetch weather per active grid cell and map result to each point.

    Args:
        engine: SQLAlchemy Engine.
        points: Segment points [(lat, lon)] from realtime selection.
        grid_size_m: Grid size in meters (Option C).
        api_key: OpenWeather API key override.

    Returns:
        dict[(lat, lon), weather_key]: weather per point (rounded 6 decimals).
    """
    logger = get_logger("weather_pipeline")
    if not points:
        return {}

    key = api_key or settings.openweather_api_key
    if not key:
        logger.warning("OpenWeather API key is empty; fallback to default weather_key=800")
        return {}

    grid_size_m = max(100, int(grid_size_m))
    min_call_interval_sec = max(
        0.0,
        float(os.getenv("OWM_GRID_MIN_CALL_INTERVAL_SEC", "0.9")),
    )

    cells: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for lat, lon in points:
        x, y = _project_to_web_mercator(float(lat), float(lon))
        cell_x = int(math.floor(x / grid_size_m))
        cell_y = int(math.floor(y / grid_size_m))
        cells[(cell_x, cell_y)].append((round(float(lat), 6), round(float(lon), 6)))

    extractor = WeatherExtractor(api_key=key)
    transformer = WeatherTransformer()
    loader = WeatherLoader(engine)

    point_weather_map: dict[tuple[float, float], int] = {}
    weather_cache_by_cell: dict[tuple[int, int], int] = {}
    fallback_count = 0
    owm_429_count = 0

    sorted_cells = sorted(cells.items(), key=lambda item: (-len(item[1]), item[0][0], item[0][1]))
    logger.info(
        "Weather grid mode: grid_size=%dm, active_cells=%d, points=%d",
        grid_size_m,
        len(sorted_cells),
        len(points),
    )

    for idx, (cell_id, cell_points) in enumerate(sorted_cells):
        cell_x, cell_y = cell_id
        center_x = (cell_x + 0.5) * grid_size_m
        center_y = (cell_y + 0.5) * grid_size_m
        center_lat, center_lon = _project_from_web_mercator(center_x, center_y)

        weather_key = 800
        try:
            raw = extractor.extract(lat=center_lat, lon=center_lon)
            records = transformer.transform(raw)
            if records:
                loader.load(records)
                weather_key = int(records[0]["weather_key"])
            else:
                fallback_count += 1
        except (DataExtractionError, DataValidationError, requests.HTTPError) as e:
            fallback_count += 1
            if "429" in str(e):
                owm_429_count += 1
                logger.warning(
                    "OWM429: rate limit hit for cell=%s center=(%.6f,%.6f)",
                    cell_id,
                    center_lat,
                    center_lon,
                )
            logger.warning(
                "Weather grid call failed for cell=%s center=(%.6f,%.6f): %s",
                cell_id,
                center_lat,
                center_lon,
                e,
            )

        weather_cache_by_cell[cell_id] = weather_key
        for pt in cell_points:
            point_weather_map[pt] = weather_key

        if min_call_interval_sec > 0 and idx < len(sorted_cells) - 1:
            time.sleep(min_call_interval_sec)

    logger.info(
        "Weather grid done: cells=%d, fallback_cells=%d, owm_429_cells=%d, distinct_weather_keys=%d",
        len(sorted_cells),
        fallback_count,
        owm_429_count,
        len(set(weather_cache_by_cell.values())),
    )
    return point_weather_map
