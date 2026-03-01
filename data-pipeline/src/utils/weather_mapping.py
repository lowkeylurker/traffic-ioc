"""Pure functions cho Weather Severity mapping & Incident transform helpers.

RÀNG BUỘC: KHÔNG import database, config, requests. 0 side-effects.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

# ═══════════════════════════════════════════════════════════
# CONSTANTS
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
# 3. WEATHER SEVERITY
# ═══════════════════════════════════════════════════════════


def get_weather_severity(weather_id: int) -> int:
    """Ánh xạ OpenWeatherMap weather_id (200–804) sang severity_level (0–5).

    Mapping:
        200–299 (Thunderstorm) → 4
        300–399 (Drizzle)      → 2
        500–599 (Rain)         → 3
        600–699 (Snow)         → 3
        700–799 (Atmosphere)   → 1
        800     (Clear)        → 0
        801–899 (Clouds)       → 0
        Khác                   → 0
    """
    if 200 <= weather_id <= 299:
        return 4
    elif 300 <= weather_id <= 399:
        return 2
    elif 500 <= weather_id <= 599:
        return 3
    elif 600 <= weather_id <= 699:
        return 3
    elif 700 <= weather_id <= 799:
        return 1
    elif weather_id == 800:
        return 0
    elif 801 <= weather_id <= 899:
        return 0
    else:
        return 0


def get_icon_category_type(icon_category: int) -> str:
    """Ánh xạ TomTom iconCategory → incident_type string.

    Args:
        icon_category: Mã loại sự cố từ TomTom Incident API.

    Returns:
        str: Tên loại sự cố, "unknown" nếu không khớp.
    """
    return ICON_CATEGORY_MAP.get(icon_category, "unknown")


# ═══════════════════════════════════════════════════════════
# 5. INCIDENT TRANSFORM
# ═══════════════════════════════════════════════════════════


def normalize_magnitude(magnitude: int | None) -> int:
    """Chuẩn hóa magnitudeOfDelay từ TomTom (0–4).

    Args:
        magnitude: magnitudeOfDelay (None/0–4).

    Returns:
        int 0–4.
    """
    if magnitude is None:
        return 0
    return max(0, min(4, magnitude))


def derive_is_active(end_time: str | None) -> bool:
    """Xác định sự cố còn đang xảy ra hay không.

    Logic:
        - end_time is None → True
        - parse(end_time) > now(Asia/Ho_Chi_Minh) → True
        - Ngược lại → False
    """
    if end_time is None:
        return True
    from dateutil.parser import parse as dt_parse

    tz_hcm = ZoneInfo("Asia/Ho_Chi_Minh")
    end_dt = dt_parse(end_time)
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=tz_hcm)
    return end_dt > datetime.now(tz=tz_hcm)
