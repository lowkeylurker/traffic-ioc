"""Data access layer for AI core."""

from .forecast_mart_repository import (
    is_forecast_mart_enabled,
    load_forecast_mart_by_segments,
    maybe_refresh_forecast_mart_for_segments,
)
from .warehouse_repository import (
    get_benchmark_segment_pool,
    get_corridors_by_segment,
    get_nearest_segments_in_corridor,
    get_segments_in_corridor,
    load_warehouse_rows_by_segments,
)

__all__ = [
    "get_benchmark_segment_pool",
    "get_corridors_by_segment",
    "get_nearest_segments_in_corridor",
    "get_segments_in_corridor",
    "is_forecast_mart_enabled",
    "load_forecast_mart_by_segments",
    "load_warehouse_rows_by_segments",
    "maybe_refresh_forecast_mart_for_segments",
]
