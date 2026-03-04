"""Pure functions cho Spatial Transform & Geo Operations.

DEPRECATED: This module is deprecated. Use src.domain.geo instead.
  - Constants: from src.domain.geo.constants import ...
  - Functions: from src.domain.geo import ...

This module is maintained for backward compatibility only.

RÀNG BUỘC: Được phép import shapely, geopandas (pure geometry).
Không import requests, sqlalchemy, database.
"""

from __future__ import annotations

import warnings

warnings.warn(
    "geo_ops module is deprecated. Use src.domain.geo instead.",
    DeprecationWarning,
    stacklevel=2,
)

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import geopandas

# ═══════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════

EARTH_RADIUS_M: int = 6_371_000

WGS84: str = "EPSG:4326"
UTM_48N: str = "EPSG:32648"

BBOX_DISTRICT_1: dict[str, float] = {
    "min_lon": 106.663,
    "min_lat": 10.743,
    "max_lon": 106.723,
    "max_lat": 10.803,
}

# HCM City full bounding box (covers all 24 districts)
BBOX_HCM: dict[str, float] = {
    "min_lon": 106.4,
    "min_lat": 10.4,
    "max_lon": 107.1,
    "max_lat": 10.95,
}

CENTER_HCM: dict[str, float] = {"lat": 10.7764, "lon": 106.7011}

DEFAULT_LANE_COUNT: dict[str, int] = {
    "trunk": 4,
    "trunk_link": 3,
    "primary": 3,
    "primary_link": 2,
    "secondary": 2,
    "secondary_link": 2,
    "tertiary": 2,
    "tertiary_link": 2,
    "residential": 2,
    "living_street": 1,
}

DEFAULT_SPEED_LIMIT: dict[str, int] = {
    "trunk": 60,
    "trunk_link": 50,
    "primary": 50,
    "primary_link": 40,
    "secondary": 40,
    "secondary_link": 40,
    "tertiary": 40,
    "tertiary_link": 30,
    "residential": 30,
    "living_street": 20,
}

FRC_MAP: dict[str, int] = {
    "trunk": 0,
    "trunk_link": 0,
    "primary": 2,
    "primary_link": 3,
    "secondary": 4,
    "secondary_link": 4,
    "tertiary": 5,
    "tertiary_link": 5,
    "residential": 6,
    "living_street": 6,
}

LANE_CAPACITY_PCU_PER_HOUR: int = 2000


# ═══════════════════════════════════════════════════════════
# 4. SPATIAL TRANSFORM
# ═══════════════════════════════════════════════════════════


def derive_node_type(highway: str | None, street_count: int) -> str:
    """Phân loại loại nút giao thông dựa trên thuộc tính OSM.

    Logic (theo thứ tự ưu tiên):
        1. highway == "traffic_signals" → "signalized"
        2. street_count >= 3           → "intersection"
        3. street_count == 1           → "terminal"
        4. Còn lại                     → "intermediate"
    """
    if highway == "traffic_signals":
        return "signalized"
    elif street_count >= 3:
        return "intersection"
    elif street_count == 1:
        return "terminal"
    else:
        return "intermediate"


def fallback_name(name: str | None) -> str:
    """Fallback cho tên đường. Null/empty → 'N/A'."""
    if name is None or (isinstance(name, str) and name.strip() == ""):
        return "N/A"
    return str(name).strip()


def parse_lanes(raw_lanes: str | int | list | None, highway: str) -> int:
    """Parse trường lanes phức tạp từ OSM.

    Dạng có thể: None, 3, "3", ["3","2"], "3;2".
    Fallback theo highway type.
    """
    if raw_lanes is None:
        return DEFAULT_LANE_COUNT.get(highway, 2)
    if isinstance(raw_lanes, int):
        return max(1, raw_lanes)
    if isinstance(raw_lanes, list):
        try:
            return max(int(x) for x in raw_lanes)
        except (ValueError, TypeError):
            return DEFAULT_LANE_COUNT.get(highway, 2)
    if isinstance(raw_lanes, str):
        try:
            if ";" in raw_lanes:
                return max(int(x.strip()) for x in raw_lanes.split(";"))
            return max(1, int(raw_lanes))
        except ValueError:
            return DEFAULT_LANE_COUNT.get(highway, 2)
    return DEFAULT_LANE_COUNT.get(highway, 2)


def parse_maxspeed(raw_speed: str | int | None, highway: str) -> int:
    """Parse trường maxspeed từ OSM. Fallback theo highway type."""
    if raw_speed is None:
        return DEFAULT_SPEED_LIMIT.get(highway, 30)
    if isinstance(raw_speed, int):
        return max(10, raw_speed)
    if isinstance(raw_speed, str):
        digits = "".join(c for c in raw_speed if c.isdigit())
        if digits:
            return max(10, int(digits))
        return DEFAULT_SPEED_LIMIT.get(highway, 30)
    return DEFAULT_SPEED_LIMIT.get(highway, 30)


def get_frc(highway: str) -> int:
    """Ánh xạ OSM highway type → TomTom FRC. Fallback: FRC 6 (local)."""
    return FRC_MAP.get(highway, 6)


def calculate_design_capacity(lane_count: int) -> int:
    """Tính năng lực thiết kế: lane_count × 2000 (PCU/h)."""
    return max(1, lane_count) * LANE_CAPACITY_PCU_PER_HOUR


# ═══════════════════════════════════════════════════════════
# 5. INCIDENT GEOMETRY
# ═══════════════════════════════════════════════════════════


def linestring_centroid(coordinates: list[list[float]]) -> tuple[float, float]:
    """Tính centroid của LineString GeoJSON.

    Args:
        coordinates: [[lon, lat], ...] – GeoJSON order.

    Returns:
        (centroid_lon, centroid_lat).
    """
    if not coordinates:
        return (0.0, 0.0)
    avg_lon = sum(c[0] for c in coordinates) / len(coordinates)
    avg_lat = sum(c[1] for c in coordinates) / len(coordinates)
    return (avg_lon, avg_lat)


# ═══════════════════════════════════════════════════════════
# 8. GEO OPERATIONS
# ═══════════════════════════════════════════════════════════


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Khoảng cách Haversine giữa 2 tọa độ (mét).

    Args:
        lat1, lon1: Tọa độ điểm 1 (WGS84 degrees).
        lat2, lon2: Tọa độ điểm 2.

    Returns:
        float: mét.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_M * c


def find_nearest_segment(
    lat: float, lon: float, segments_gdf: "geopandas.GeoDataFrame"
) -> int:
    """Tìm segment gần nhất với tọa độ cho trước.

    Args:
        lat, lon: Tọa độ điểm cần match.
        segments_gdf: GeoDataFrame chứa dim_segment (geometry column).

    Returns:
        int: segment_key của segment gần nhất.
    """
    from shapely.geometry import Point

    point = Point(lon, lat)  # shapely dùng (x=lon, y=lat)
    distances = segments_gdf.geometry.distance(point)
    nearest_idx = distances.idxmin()
    return int(segments_gdf.loc[nearest_idx, "segment_key"])


def coords_to_wkt_point(lon: float, lat: float) -> str:
    """Convert (lon, lat) → WKT Point string."""
    return f"POINT({lon} {lat})"


def coords_to_wkt_linestring(coords: list[tuple[float, float]]) -> str:
    """Convert list of (lon, lat) → WKT LineString.

    Args:
        coords: [(lon1, lat1), (lon2, lat2), ...]
    """
    pairs = ", ".join(f"{lon} {lat}" for lon, lat in coords)
    return f"LINESTRING({pairs})"
