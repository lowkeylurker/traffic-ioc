"""Domain layer for weather-related operations.

Provides weather severity mapping, incident category resolution,
and status derivation for real-time traffic analysis.
"""

from __future__ import annotations

from .mapping import (
    derive_is_active,
    get_icon_category_type,
    get_weather_severity,
    normalize_magnitude,
)

__all__ = [
    "get_weather_severity",
    "get_icon_category_type",
    "normalize_magnitude",
    "derive_is_active",
]
