"""Pure functions cho Traffic Metrics, PCU Estimation, Key Generation, Time Derivation.

DEPRECATED: This module is deprecated. Use src.domain.math instead.
  - Constants: from src.domain.math.constants import ...
  - Key generators: from src.domain.math.key_generator import ...
  - Functions: from src.domain.math import ...

This module is maintained for backward compatibility only.

RÀNG BUỘC: KHÔNG import database, config, requests. Chỉ primitive types vào/ra.
100% type-annotated, 0 side-effects.
"""

from __future__ import annotations

import warnings

warnings.warn(
    "math_calc module is deprecated. Use src.domain.math instead.",
    DeprecationWarning,
    stacklevel=2,
)

import hashlib
import math
from datetime import datetime
from zoneinfo import ZoneInfo

# ═══════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════

# PCU Coefficients (Hệ số quy đổi TP.HCM)
PCU_MOTORCYCLE: float = 0.25
PCU_CAR: float = 1.0
PCU_BUS_TRUCK: float = 2.0

# BPR Parameters (Bureau of Public Roads)
BPR_ALPHA: float = 0.15
BPR_BETA: float = 4.0
LANE_CAPACITY: int = 2000  # PCU/h per lane

# LOS Thresholds (HCM 2010)
LOS_THRESHOLDS: dict[str, tuple[float, float]] = {
    "A": (0.00, 0.15),
    "B": (0.15, 0.30),
    "C": (0.30, 0.45),
    "D": (0.45, 0.60),
    "E": (0.60, 0.80),
    "F": (0.80, 1.00),
}

# Timezone
TZ_HCM = ZoneInfo("Asia/Ho_Chi_Minh")


# ═══════════════════════════════════════════════════════════
# 1. TRAFFIC METRICS
# ═══════════════════════════════════════════════════════════


def calculate_traffic_index(current_speed: float, free_flow_speed: float) -> float:
    """Tính chỉ số giao thông (Traffic Index).

    Công thức: traffic_index = 1.0 - (current_speed / free_flow_speed)
    - 0.0 = giao thông thông thoáng
    - 1.0 = tắc nghẽn hoàn toàn

    Args:
        current_speed: Vận tốc hiện tại (km/h).
        free_flow_speed: Vận tốc thông thoáng (km/h).

    Returns:
        float trong [0.0, 1.0].
    """
    if free_flow_speed <= 0:
        return 0.0
    ratio = current_speed / free_flow_speed
    index = 1.0 - ratio
    return max(0.0, min(1.0, index))


def calculate_los_level(traffic_index: float) -> str:
    """Phân loại mức độ phục vụ (Level of Service) theo HCM 2010.

    Args:
        traffic_index: 0.0–1.0.

    Returns:
        'A', 'B', 'C', 'D', 'E', hoặc 'F'.
    """
    if traffic_index <= 0.15:
        return "A"
    elif traffic_index <= 0.30:
        return "B"
    elif traffic_index <= 0.45:
        return "C"
    elif traffic_index <= 0.60:
        return "D"
    elif traffic_index <= 0.80:
        return "E"
    else:
        return "F"


def calculate_congestion_level(los_level: str) -> int:
    """Ánh xạ LOS (A–F) sang congestion_level (0–5).

    Args:
        los_level: 'A'–'F'.

    Returns:
        int 0–5.
    """
    mapping = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}
    return mapping.get(los_level.upper(), 0) if isinstance(los_level, str) else 0


def calculate_delay_seconds(current_travel_time: int, free_flow_travel_time: int) -> int:
    """Tính độ trễ di chuyển (giây).

    Args:
        current_travel_time: Thời gian thực tế (giây).
        free_flow_travel_time: Thời gian free-flow (giây).

    Returns:
        int >= 0.
    """
    return max(0, current_travel_time - free_flow_travel_time)


def calculate_quality_flag(confidence: float) -> int:
    """Chuyển confidence (0.0–1.0) thành quality_flag (0–9) SMALLINT.

    Args:
        confidence: Độ tin cậy từ TomTom API.

    Returns:
        int 0–9.
    """
    return round(max(0.0, min(1.0, confidence)) * 9)


# ═══════════════════════════════════════════════════════════
# 2. PCU ESTIMATION
# ═══════════════════════════════════════════════════════════


def calculate_pcu(
    motorcycles: int = 0, cars: int = 0, buses_trucks: int = 0
) -> float:
    """Tính tổng lưu lượng quy đổi PCU từ đếm xe trực tiếp.

    Args:
        motorcycles: Số xe máy.
        cars: Số ô tô con.
        buses_trucks: Số xe tải/xe buýt.

    Returns:
        float >= 0.
    """
    return (motorcycles * PCU_MOTORCYCLE) + (cars * PCU_CAR) + (buses_trucks * PCU_BUS_TRUCK)


def estimate_pcu_from_speed(
    current_speed: float,
    free_flow_speed: float,
    lane_count: int,
) -> float:
    """Ước lượng lưu lượng PCU từ tốc độ bằng BPR inverse formula.

    Args:
        current_speed: Vận tốc thực tế (km/h).
        free_flow_speed: Vận tốc free-flow (km/h).
        lane_count: Số làn xe.

    Returns:
        float: PCU volume (DECIMAL(10,2)).
    """
    if free_flow_speed <= 0 or lane_count <= 0:
        return 0.0
    if current_speed <= 0:
        return float(lane_count * LANE_CAPACITY)
    if current_speed >= free_flow_speed:
        return 0.0

    capacity = lane_count * LANE_CAPACITY
    time_ratio = free_flow_speed / current_speed  # t / t0

    excess = (time_ratio - 1.0) / BPR_ALPHA
    if excess <= 0:
        return 0.0

    v_c_ratio = excess ** (1.0 / BPR_BETA)
    pcu_volume = capacity * v_c_ratio

    # Clamp: không vượt quá capacity × 1.5
    return round(min(pcu_volume, capacity * 1.5), 2)


# ═══════════════════════════════════════════════════════════
# 6. KEY GENERATION
# ═══════════════════════════════════════════════════════════


def generate_traffic_flow_key(segment_key: int, date_key: int, time_key: int) -> int:
    """Sinh traffic_flow_key (BIGINT PK) deterministic.

    Công thức: int(sha256(f"{segment_key}_{date_key}_{time_key}").hexdigest()[:15], 16)
    """
    raw = f"{segment_key}_{date_key}_{time_key}"
    hex_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def generate_incident_key(incident_id: str) -> int:
    """Sinh incident_key (BIGINT PK) từ TomTom incident id."""
    hex_hash = hashlib.sha256(incident_id.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def generate_segment_key(from_node: int, to_node: int, osmid: int) -> int:
    """Sinh segment_key (BIGINT PK) từ OSM edge triple."""
    raw = f"{from_node}_{to_node}_{osmid}"
    hex_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def generate_road_key(road_name: str) -> int:
    """Sinh road_key (BIGINT PK) từ tên đường."""
    hex_hash = hashlib.sha256(road_name.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def generate_corridor_key(corridor_name: str) -> int:
    """Sinh corridor_key (BIGINT PK) từ tên hành lang giao thông."""
    hex_hash = hashlib.sha256(corridor_name.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


# ═══════════════════════════════════════════════════════════
# 7. TIME DERIVATION
# ═══════════════════════════════════════════════════════════


def derive_date_key(ts: datetime | None = None) -> int:
    """Chuyển timestamp → date_key (YYYYMMDD INT).

    Luôn convert sang Asia/Ho_Chi_Minh trước khi format.
    """
    if ts is None:
        ts = datetime.now(tz=TZ_HCM)
    elif ts.tzinfo is None:
        ts = ts.replace(tzinfo=TZ_HCM)
    else:
        ts = ts.astimezone(TZ_HCM)
    return int(ts.strftime("%Y%m%d"))


def derive_time_key(ts: datetime | None = None) -> int:
    """Chuyển timestamp → time_key (minute of day, 0–1439).

    Luôn convert sang Asia/Ho_Chi_Minh.
    """
    if ts is None:
        ts = datetime.now(tz=TZ_HCM)
    elif ts.tzinfo is None:
        ts = ts.replace(tzinfo=TZ_HCM)
    else:
        ts = ts.astimezone(TZ_HCM)
    return ts.hour * 60 + ts.minute


def derive_month_year_key(date_key: int) -> int:
    """Trích month_year_key từ date_key. VD: 20260228 → 202602."""
    return date_key // 100
