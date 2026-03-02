"""Weather and Incident Severity Mapping.

Maps OpenWeatherMap conditions and TomTom incidents to severity levels.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo


# ═══════════════════════════════════════════════════════════
# ICON CATEGORY MAPPING
# ═══════════════════════════════════════════════════════════

ICON_CATEGORY_MAP: dict[int, str] = {
    1: "accident",
    2: "fog",
    3: "dangerous_conditions",
    4: "rain",
    5: "ice",
    6: "jam",
    7: "lane_closed",
    8: "road_closed",
    9: "road_works",
    10: "wind",
    11: "flooding",
    14: "broken_down_vehicle",
}


# ═══════════════════════════════════════════════════════════
# WEATHER SEVERITY
# ═══════════════════════════════════════════════════════════


def get_weather_severity(weather_id: int) -> int:
    """Map OpenWeatherMap weather_id to severity_level.

    Mapping:
        200–212 (Thunderstorm) → 4 (dangerous)
        300–310 (Drizzle)      → 2 (moderate)
        500–521 (Rain)         → 3 (significant)
        600–699 (Snow)         → 3 (significant)
        700–799 (Atmosphere)   → 1 (minimal)
        800     (Clear)        → 0 (none)
        801–804 (Clouds)       → 0 (none)
        999     (Unknown)      → 0 (none)

    Args:
        weather_id: OpenWeatherMap condition code

    Returns:
        int: Severity level (0–4)
    """
    if 200 <= weather_id <= 299:
        return 4  # Thunderstorm - dangerous
    elif 300 <= weather_id <= 399:
        return 2  # Drizzle - moderate
    elif 500 <= weather_id <= 599:
        return 3  # Rain - significant
    elif 600 <= weather_id <= 699:
        return 3  # Snow - significant
    elif 700 <= weather_id <= 799:
        return 1  # Atmosphere/mist/fog - minimal
    elif weather_id == 800:
        return 0  # Clear - none
    elif 801 <= weather_id <= 899:
        return 0  # Clouds - none
    else:
        return 0  # Unknown/fallback


# ═══════════════════════════════════════════════════════════
# INCIDENT CATEGORY MAPPING
# ═══════════════════════════════════════════════════════════


def get_icon_category_type(icon_category: int) -> str:
    """Map TomTom iconCategory to incident type name.

    Args:
        icon_category: Icon category code from TomTom Incident API

    Returns:
        str: Incident type name, or "unknown" if not in map
    """
    return ICON_CATEGORY_MAP.get(icon_category, "unknown")


# ═══════════════════════════════════════════════════════════
# INCIDENT STATUS
# ═══════════════════════════════════════════════════════════


def normalize_magnitude(magnitude: int | None) -> int:
    """Normalize magnitudeOfDelay from TomTom (0–4).

    Args:
        magnitude: Magnitude value (None → 0)

    Returns:
        int: Normalized magnitude in range [0, 4]
    """
    if magnitude is None:
        return 0
    return max(0, min(4, magnitude))


def derive_is_active(end_time: str | None) -> bool:
    """Determine if incident is still active.

    Logic:
        - end_time is None → True (ongoing)
        - parse(end_time) > now(Asia/Ho_Chi_Minh) → True (future end)
        - Otherwise → False (ended)

    Args:
        end_time: ISO8601 timestamp or None

    Returns:
        bool: True if incident currently active
    """
    if end_time is None:
        return True

    from dateutil.parser import parse as dt_parse

    tz_hcm = ZoneInfo("Asia/Ho_Chi_Minh")
    end_dt = dt_parse(end_time)
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=tz_hcm)
    return end_dt > datetime.now(tz=tz_hcm)
