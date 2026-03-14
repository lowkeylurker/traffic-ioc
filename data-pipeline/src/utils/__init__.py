"""Utils layer – Pure Functions (không side-effect).

Re-exports from domain layer:
    domain.math       – Traffic metrics, PCU, key generation, time derivation
    domain.weather    – Weather severity, icon category, incident helpers
    domain.geo        – Spatial transforms, haversine, WKT helpers

Note: This module maintains backward compatibility by re-exporting domain modules.
      For new code, import directly from domain.* modules.
"""

# Geospatial operations (domain.geo)
from src.domain.geo import (
    calculate_design_capacity,
    coords_to_wkt_linestring,
    coords_to_wkt_point,
    derive_node_type,
    fallback_name,
    find_nearest_segment,
    get_frc,
    haversine_distance,
    linestring_centroid,
    parse_lanes,
    parse_maxspeed,
)
from src.domain.geo.constants import (
    BBOX_DISTRICT_1,
    CENTER_HCM,
    DEFAULT_LANE_COUNT,
    DEFAULT_SPEED_LIMIT,
    FRC_MAP,
)

# Traffic metrics (domain.math)
from src.domain.math import (
    calculate_congestion_level,
    calculate_delay_seconds,
    calculate_los_level,
    calculate_pcu,
    calculate_quality_flag,
    calculate_traffic_index,
    derive_date_key,
    derive_month_year_key,
    derive_time_key,
    estimate_pcu_from_speed,
)
from src.domain.math.constants import (
    BPR_ALPHA,
    BPR_BETA,
    LANE_CAPACITY,
    LOS_THRESHOLDS,
    PCU_BUS_TRUCK,
    PCU_CAR,
    PCU_MOTORCYCLE,
    TZ_HCM,
)
from src.domain.math.key_generator import (
    generate_corridor_key,
    generate_incident_key,
    generate_road_key,
    generate_segment_key,
    generate_traffic_flow_key,
)

# Weather mapping (domain.weather)
from src.domain.weather import (
    derive_is_active,
    get_icon_category_type,
    get_weather_severity,
    normalize_magnitude,
)
from src.domain.weather.mapping import ICON_CATEGORY_MAP

__all__ = [
    # math_calc
    "calculate_traffic_index",
    "calculate_los_level",
    "calculate_congestion_level",
    "calculate_delay_seconds",
    "calculate_quality_flag",
    "calculate_pcu",
    "estimate_pcu_from_speed",
    "generate_traffic_flow_key",
    "generate_incident_key",
    "generate_segment_key",
    "generate_road_key",
    "derive_date_key",
    "derive_time_key",
    "derive_month_year_key",
    "TZ_HCM",
    "PCU_MOTORCYCLE",
    "PCU_CAR",
    "PCU_BUS_TRUCK",
    "BPR_ALPHA",
    "BPR_BETA",
    "LANE_CAPACITY",
    "LOS_THRESHOLDS",
    # weather_mapping
    "get_weather_severity",
    "get_icon_category_type",
    "normalize_magnitude",
    "derive_is_active",
    "ICON_CATEGORY_MAP",
    # geo_ops
    "derive_node_type",
    "fallback_name",
    "parse_lanes",
    "parse_maxspeed",
    "get_frc",
    "calculate_design_capacity",
    "linestring_centroid",
    "haversine_distance",
    "find_nearest_segment",
    "coords_to_wkt_point",
    "coords_to_wkt_linestring",
    "DEFAULT_LANE_COUNT",
    "DEFAULT_SPEED_LIMIT",
    "FRC_MAP",
    "BBOX_DISTRICT_1",
    "CENTER_HCM",
]
