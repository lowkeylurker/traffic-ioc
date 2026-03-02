"""Traffic Metrics Constants and Thresholds.

PCU coefficients, BPR parameters, and LOS thresholds for HCM traffic analysis.
"""

from zoneinfo import ZoneInfo

# ═══════════════════════════════════════════════════════════
# PCU COEFFICIENTS (TP.HCM Standard)
# ═══════════════════════════════════════════════════════════

PCU_MOTORCYCLE: float = 0.25
PCU_CAR: float = 1.0
PCU_BUS_TRUCK: float = 2.0


# ═════════════════════════════════════════════════════════════
# BPR PARAMETERS (Bureau of Public Roads)
# ═════════════════════════════════════════════════════════════

BPR_ALPHA: float = 0.15
BPR_BETA: float = 4.0
LANE_CAPACITY: int = 2000  # PCU/h per lane


# ═════════════════════════════════════════════════════════════
# LEVEL OF SERVICE (LOS) THRESHOLDS (HCM 2010)
# ═════════════════════════════════════════════════════════════

# Traffic index (0.0 = free flow, 1.0 = complete congestion)
LOS_THRESHOLDS: dict[str, tuple[float, float]] = {
    "A": (0.00, 0.15),  # Free flow
    "B": (0.15, 0.30),  # Stable flow
    "C": (0.30, 0.45),  # Stable flow, approaching instability
    "D": (0.45, 0.60),  # Unstable flow
    "E": (0.60, 0.80),  # Heavy congestion
    "F": (0.80, 1.00),  # Complete gridlock
}


# ═════════════════════════════════════════════════════════════
# TIMEZONE
# ═════════════════════════════════════════════════════════════

TZ_HCM = ZoneInfo("Asia/Ho_Chi_Minh")
