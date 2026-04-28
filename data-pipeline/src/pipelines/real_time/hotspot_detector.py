"""Hotspot Detector – Identify congested tiles and prepare segment mapping.

Analyze tile-level traffic metrics to detect hotspots above threshold,
then prepare list of segments within hotspot tiles for detail API scanning.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from src.core.config import settings
from src.core.logger import get_logger


@dataclass
class Hotspot:
    """Tile-level hotspot metadata."""

    tile_z: int
    tile_x: int
    tile_y: int
    traffic_index: float  # avg across tile
    flow_speed_kmh: float  # avg speed in tile
    freeflow_speed_kmh: float  # baseline freeflow
    confidence: float = 1.0  # confidence in measurement

    def __hash__(self):
        return hash((self.tile_z, self.tile_x, self.tile_y))

    def __eq__(self, other):
        if not isinstance(other, Hotspot):
            return False
        return (
            self.tile_z == other.tile_z
            and self.tile_x == other.tile_x
            and self.tile_y == other.tile_y
        )


class HotspotDetector:
    """Detect hotspots from tile-level flow data."""

    def __init__(self, threshold: float = 0.10):
        """Initialize detector with congestion threshold.

        Args:
            threshold: traffic_index > threshold → hotspot
        """
        self.threshold = threshold
        self.logger = get_logger(self.__class__.__name__)

    def analyze_tile(
        self,
        tile_z: int,
        tile_x: int,
        tile_y: int,
        tile_data: dict,
    ) -> Optional[Hotspot]:
        """Analyze single tile response.

        TomTom Tile API response structure (example):
        {
            "data": [
                {"currentFlow": {...}},  # Detailed per segment?
            ]
        }

        For simplicity, estimate tile-level avg:
          - Extract average speed from tile (if available)
          - Compare with freeflow baseline
          - Compute traffic_index
        """
        try:
            # Aggregate speed across supported payload shapes.
            speeds = []

            # Shape A: flowSegmentData/flowSegmentData (flowSegmentData API style)
            fsd = tile_data.get("flowSegmentData")
            if isinstance(fsd, dict):
                for key in ("currentSpeed", "current_speed", "speed"):
                    value = fsd.get(key)
                    if value is not None:
                        speeds.append(float(value))
                        break

            # Shape B: data[] with currentFlow.speed (tile-like wrappers)
            data_list = tile_data.get("data", [])
            if isinstance(data_list, list):
                for item in data_list:
                    flow = item.get("currentFlow", {}) if isinstance(item, dict) else {}
                    speed = flow.get("speed")
                    if speed is not None:
                        speeds.append(float(speed))

            if not speeds:
                self.logger.debug("Tile (%d,%d,%d): no usable speed data", tile_z, tile_x, tile_y)
                return None

            avg_speed = sum(speeds) / len(speeds)
            # Assume freeflow ~50 kmh for urban HCM
            freeflow_speed = 50.0
            traffic_index = 1.0 - (avg_speed / freeflow_speed) if freeflow_speed > 0 else 0
            traffic_index = min(1.0, max(0.0, traffic_index))

            hotspot = Hotspot(
                tile_z=tile_z,
                tile_x=tile_x,
                tile_y=tile_y,
                traffic_index=traffic_index,
                flow_speed_kmh=avg_speed,
                freeflow_speed_kmh=freeflow_speed,
            )

            is_hotspot = hotspot.traffic_index > self.threshold
            self.logger.debug(
                "Tile (%d,%d,%d): speed=%.1f, ti=%.3f, hotspot=%s",
                tile_z,
                tile_x,
                tile_y,
                avg_speed,
                traffic_index,
                is_hotspot,
            )

            return hotspot if is_hotspot else None

        except Exception as e:
            self.logger.warning(
                "Error analyzing tile (%d,%d,%d): %s", tile_z, tile_x, tile_y, e
            )
            return None

    def detect_hotspots(
        self,
        tiles_data: dict[tuple[int, int, int], dict],
    ) -> set[Hotspot]:
        """Detect all hotspots from tile responses.

        Args:
            tiles_data: dict[(z,x,y)] = tile response

        Returns:
            set of Hotspot objects above threshold
        """
        hotspots = set()
        threshold = settings.flow_tile_threshold

        self.logger.info(
            "Detecting hotspots (threshold=%.2f) across %d tiles",
            threshold,
            len(tiles_data),
        )

        for (tile_z, tile_x, tile_y), tile_data in tiles_data.items():
            hotspot = self.analyze_tile(tile_z, tile_x, tile_y, tile_data)
            if hotspot:
                hotspots.add(hotspot)

        self.logger.info("Detected %d hotspots", len(hotspots))
        return hotspots

    def get_hotspot_summary(self, hotspots: set[Hotspot]) -> dict:
        """Get summary statistics of detected hotspots."""
        if not hotspots:
            return {"count": 0, "avg_ti": 0, "max_ti": 0}

        traffic_indices = [h.traffic_index for h in hotspots]
        return {
            "count": len(hotspots),
            "avg_ti": sum(traffic_indices) / len(traffic_indices),
            "max_ti": max(traffic_indices),
            "min_ti": min(traffic_indices),
        }
