"""Traffic Metrics and Calculations.

PCU estimation, delay calculations, LOS classification, and time derivation.
"""

from __future__ import annotations

from datetime import datetime

from .constants import (
    BPR_ALPHA,
    BPR_BETA,
    LANE_CAPACITY,
    LOS_THRESHOLDS,
    PCU_BUS_TRUCK,
    PCU_CAR,
    PCU_MOTORCYCLE,
    TZ_HCM,
)


# ═══════════════════════════════════════════════════════════
# TRAFFIC INDEX & LOS
# ═══════════════════════════════════════════════════════════


def calculate_traffic_index(current_speed: float, free_flow_speed: float) -> float:
    """Calculate Traffic Index.

    Formula: traffic_index = 1.0 - (current_speed / free_flow_speed)
    - 0.0 = free flow
    - 1.0 = complete congestion

    Args:
        current_speed: Current speed (km/h)
        free_flow_speed: Free-flow speed (km/h)

    Returns:
        float in [0.0, 1.0], defaults to 0.0 (free flow) on invalid input
    """
    # Validate: free_flow_speed must be positive
    if free_flow_speed <= 0:
        return 0.0  # Default to free flow if invalid
    
    # Ensure current_speed is non-negative
    safe_speed = max(0.0, current_speed)
    
    ratio = safe_speed / free_flow_speed
    index = 1.0 - ratio
    return max(0.0, min(1.0, index))


def calculate_los_level(traffic_index: float) -> str:
    """Determine Level of Service (A-F) from traffic index.

    Based on HCM 2010 standards.

    Args:
        traffic_index: 0.0–1.0

    Returns:
        str: Service level 'A'–'F'
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
    """Map LOS (A–F) to numeric congestion level (0–5).

    Args:
        los_level: 'A'–'F'

    Returns:
        int: 0=free flow, 5=gridlock
    """
    mapping = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}
    return mapping.get(los_level.upper(), 0) if isinstance(los_level, str) else 0


def calculate_delay_seconds(
    current_travel_time: int, free_flow_travel_time: int
) -> int:
    """Calculate travel delay (seconds).

    Args:
        current_travel_time: Actual travel time (seconds)
        free_flow_travel_time: Free-flow travel time (seconds)

    Returns:
        int: Delay >= 0
    """
    return max(0, current_travel_time - free_flow_travel_time)


def calculate_quality_flag(confidence: float) -> int:
    """Convert confidence (0.0–1.0) to quality_flag (0–9).

    Args:
        confidence: Data confidence score (0.0–1.0)

    Returns:
        int: Quality flag 0–9
    """
    return round(max(0.0, min(1.0, confidence)) * 9)


# ═══════════════════════════════════════════════════════════
# PCU ESTIMATION
# ═══════════════════════════════════════════════════════════


def calculate_pcu(
    motorcycles: int = 0, cars: int = 0, buses_trucks: int = 0
) -> float:
    """Calculate total PCU volume from vehicle counts.

    Using HCM standard coefficients:
    - Motorcycle: 0.25 PCU
    - Car: 1.0 PCU
    - Bus/Truck: 2.0 PCU

    Args:
        motorcycles: Count of motorcycles
        cars: Count of cars
        buses_trucks: Count of buses/trucks

    Returns:
        float: Total PCU volume >= 0
    """
    return (
        (motorcycles * PCU_MOTORCYCLE)
        + (cars * PCU_CAR)
        + (buses_trucks * PCU_BUS_TRUCK)
    )


def estimate_pcu_from_speed(
    current_speed: float,
    free_flow_speed: float,
    lane_count: int,
    *,
    bpr_alpha: float = BPR_ALPHA,
    bpr_beta: float = BPR_BETA,
    max_vc_ratio: float = 1.0,
) -> float:
    """Estimate PCU volume from speed using BPR inverse formula.

    Bureau of Public Roads (BPR) relationship:
    travel_time / t0 = 1 + α(v/c)^β

    Rearranged to estimate v/c ratio from speed ratio.
    
    ⚠️ IMPORTANT: BPR inverse is only valid for v/c ≤ 1.0 (at or below capacity).
    When speed drops significantly, it may indicate incidents/signals rather than volume.
    We cap v/c at 1.0 to avoid unrealistic over-capacity estimates.

    Args:
        current_speed: Current speed (km/h)
        free_flow_speed: Free-flow speed (km/h)
        lane_count: Number of lanes
        bpr_alpha: BPR alpha parameter (default from constants)
        bpr_beta: BPR beta parameter (default from constants)
        max_vc_ratio: Upper bound for estimated v/c ratio

    Returns:
        float: Estimated PCU volume (max 100% capacity)
    """
    if free_flow_speed <= 0 or lane_count <= 0:
        return 0.0
    bpr_alpha = max(1e-6, float(bpr_alpha))
    bpr_beta = max(1e-6, float(bpr_beta))
    max_vc_ratio = max(0.12, float(max_vc_ratio))
    if current_speed <= 0:
        # Complete stop → assume at capacity (not over-capacity)
        return round(float(lane_count * LANE_CAPACITY) * min(1.0, max_vc_ratio), 2)
    
    capacity = lane_count * LANE_CAPACITY
    
    # Free flow: baseline traffic (10-15% capacity)
    if current_speed >= free_flow_speed:
        return round(capacity * 0.12, 2)

    time_ratio = free_flow_speed / current_speed  # t / t0

    excess = (time_ratio - 1.0) / bpr_alpha
    if excess <= 0:
        # Near free-flow conditions
        return round(capacity * 0.12, 2)

    v_c_ratio = excess ** (1.0 / bpr_beta)
    
    # ⚠️ FIX: Cap v/c at 1.0 (100% capacity) - BPR inverse invalid beyond this point
    # Speed reduction may be due to incidents/signals, not necessarily high volume
    v_c_ratio = min(v_c_ratio, max_vc_ratio)
    
    pcu_volume = capacity * v_c_ratio

    return round(pcu_volume, 2)


# ═══════════════════════════════════════════════════════════
# TIME DERIVATION
# ═══════════════════════════════════════════════════════════


def derive_date_key(ts: datetime | None = None) -> int:
    """Convert timestamp to date_key (YYYYMMDD INT).

    Always converts to Asia/Ho_Chi_Minh timezone.

    Args:
        ts: Timestamp (defaults to current UTC)

    Returns:
        int: Date key (e.g., 20260302)
    """
    if ts is None:
        ts = datetime.now(tz=TZ_HCM)
    elif ts.tzinfo is None:
        ts = ts.replace(tzinfo=TZ_HCM)
    else:
        ts = ts.astimezone(TZ_HCM)
    return int(ts.strftime("%Y%m%d"))


def derive_time_key(ts: datetime | None = None) -> int:
    """Convert timestamp to time_key (minute of day, 0–1439).

    Always converts to Asia/Ho_Chi_Minh timezone.

    Args:
        ts: Timestamp (defaults to current UTC)

    Returns:
        int: Time key in range [0, 1439]
    """
    if ts is None:
        ts = datetime.now(tz=TZ_HCM)
    elif ts.tzinfo is None:
        ts = ts.replace(tzinfo=TZ_HCM)
    else:
        ts = ts.astimezone(TZ_HCM)
    return ts.hour * 60 + ts.minute


def derive_month_year_key(date_key: int) -> int:
    """Extract month_year_key from date_key.

    Example: 20260228 → 202602

    Args:
        date_key: Date key (YYYYMMDD)

    Returns:
        int: Month-year key (YYYYMM)
    """
    return date_key // 100
