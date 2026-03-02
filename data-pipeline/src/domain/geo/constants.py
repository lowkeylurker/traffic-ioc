"""Geographic Constants for HCM Traffic System.

Includes bounding boxes, coordinate systems, and default values for OSM processing.
"""

# ═══════════════════════════════════════════════════════════
# COORDINATE SYSTEMS
# ═══════════════════════════════════════════════════════════

EARTH_RADIUS_M: int = 6_371_000

WGS84: str = "EPSG:4326"
UTM_48N: str = "EPSG:32648"


# ═══════════════════════════════════════════════════════════
# GEOGRAPHIC BOUNDARIES
# ═══════════════════════════════════════════════════════════

# District 1 (Quận 1) - Initial coverage area
BBOX_DISTRICT_1: dict[str, float] = {
    "min_lon": 106.663,
    "min_lat": 10.743,
    "max_lon": 106.723,
    "max_lat": 10.803,
}

# HCM City full bounding box (covers all 24 districts + districts)
BBOX_HCM: dict[str, float] = {
    "min_lon": 106.4,     # West boundary
    "min_lat": 10.4,      # South boundary
    "max_lon": 107.1,     # East boundary
    "max_lat": 10.95,     # North boundary
}

# City center coordinates
CENTER_HCM: dict[str, float] = {
    "lat": 10.7764,
    "lon": 106.7011,
}


# ═══════════════════════════════════════════════════════════
# ROAD CLASSIFICATION DEFAULTS
# ═══════════════════════════════════════════════════════════

# Default lane count by OSM highway type
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

# Default speed limit (km/h) by OSM highway type
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

# Functional Road Class (FRC) mapping
# TomTom classification: 0=motorway, 1=major, 2=other major, ..., 7=small
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

# Road capacity
LANE_CAPACITY_PCU_PER_HOUR: int = 2000  # Passenger Car Units per hour per lane
