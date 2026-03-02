"""Geospatial Operations and Transformations.

Pure functions for spatial transforms, WKT conversion, and geo calculations.
No dependencies on database, config, or business logic.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import geopandas

from .constants import (
    DEFAULT_LANE_COUNT,
    DEFAULT_SPEED_LIMIT,
    EARTH_RADIUS_M,
    FRC_MAP,
    LANE_CAPACITY_PCU_PER_HOUR,
)


# ═══════════════════════════════════════════════════════════
# NODE CLASSIFICATION
# ═══════════════════════════════════════════════════════════


def derive_node_type(highway: str | None, street_count: int) -> str:
    """Classify node type based on OSM attributes.

    Logic (priority order):
        1. highway == "traffic_signals" → "signalized"
        2. street_count >= 3           → "intersection"
        3. street_count == 1           → "terminal"
        4. Otherwise                   → "intermediate"

    Args:
        highway: OSM highway tag value
        street_count: Number of streets at node

    Returns:
        str: Node type classification
    """
    if highway == "traffic_signals":
        return "signalized"
    elif street_count >= 3:
        return "intersection"
    elif street_count == 1:
        return "terminal"
    else:
        return "intermediate"


# ═══════════════════════════════════════════════════════════
# ROAD ATTRIBUTE PARSING
# ═══════════════════════════════════════════════════════════


def fallback_name(name: str | None) -> str:
    """Fallback for road name. None/empty → 'N/A'.

    Args:
        name: Raw name value from OSM

    Returns:
        str: Cleaned name or 'N/A'
    """
    if name is None or (isinstance(name, str) and name.strip() == ""):
        return "N/A"
    return str(name).strip()


def parse_lanes(raw_lanes: str | int | list | None, highway: str) -> int:
    """Parse complex lanes field from OSM.

    Handles formats: None, 3, "3", ["3","2"], "3;2".
    Falls back to highway type defaults.

    Args:
        raw_lanes: Raw lanes value from OSM
        highway: Highway type for default lookup

    Returns:
        int: Number of lanes (minimum 1)
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
    """Parse maxspeed field from OSM.

    Falls back to highway type defaults.

    Args:
        raw_speed: Raw maxspeed value from OSM (can include units)
        highway: Highway type for default lookup

    Returns:
        int: Speed limit in km/h (minimum 10)
    """
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
    """Map OSM highway type → TomTom Functional Road Class.

    FRC scale: 0=motorway, ..., 6=local, 7=small

    Args:
        highway: OSM highway tag value

    Returns:
        int: TomTom FRC (fallback 6 for unknown)
    """
    return FRC_MAP.get(highway, 6)


def calculate_design_capacity(lane_count: int) -> int:
    """Calculate design capacity: lane_count × 2000 (PCU/h).

    Args:
        lane_count: Number of lanes

    Returns:
        int: Capacity in Passenger Car Units per hour
    """
    return max(1, lane_count) * LANE_CAPACITY_PCU_PER_HOUR


# ═══════════════════════════════════════════════════════════
# GEOMETRY CALCULATIONS
# ═══════════════════════════════════════════════════════════


def linestring_centroid(coordinates: list[list[float]]) -> tuple[float, float]:
    """Calculate centroid of a LineString.

    Args:
        coordinates: [[lon, lat], ...] in GeoJSON order

    Returns:
        tuple: (centroid_lon, centroid_lat)
    """
    if not coordinates:
        return (0.0, 0.0)
    avg_lon = sum(c[0] for c in coordinates) / len(coordinates)
    avg_lat = sum(c[1] for c in coordinates) / len(coordinates)
    return (avg_lon, avg_lat)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Haversine distance between two coordinates (meters).

    Args:
        lat1, lon1: First coordinate (WGS84 degrees)
        lat2, lon2: Second coordinate

    Returns:
        float: Distance in meters
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
    """Find nearest segment to given coordinate.

    Args:
        lat, lon: Target coordinate (WGS84)
        segments_gdf: GeoDataFrame with geometry column

    Returns:
        int: segment_key of nearest segment
    """
    from shapely.geometry import Point

    point = Point(lon, lat)  # shapely: x=lon, y=lat
    distances = segments_gdf.geometry.distance(point)
    nearest_idx = distances.idxmin()
    return int(segments_gdf.loc[nearest_idx, "segment_key"])


# ═══════════════════════════════════════════════════════════
# WKT CONVERSION
# ═══════════════════════════════════════════════════════════


def coords_to_wkt_point(lon: float, lat: float) -> str:
    """Convert (lon, lat) → WKT Point string.

    Args:
        lon, lat: Coordinates

    Returns:
        str: WKT format "POINT(lon lat)"
    """
    return f"POINT({lon} {lat})"


def coords_to_wkt_linestring(coords: list[tuple[float, float]]) -> str:
    """Convert list of (lon, lat) → WKT LineString.

    Args:
        coords: [(lon1, lat1), (lon2, lat2), ...]

    Returns:
        str: WKT format "LINESTRING(lon lat, lon lat, ...)"
    """
    pairs = ", ".join(f"{lon} {lat}" for lon, lat in coords)
    return f"LINESTRING({pairs})"
