"""Flow Tile Pipeline – Orchestrate coarse-to-detail adaptive traffic scanning.

Pipeline flow:
  1. Extract coarse flow tiles for HCM (zoom 15)
  2. Detect hotspots (traffic_index > threshold)
  3. Map hotspot tiles to detail segments
  4. Extract detail Traffic Flow API data for hotspot segments
  5. Mark non-hotspot segments as free_flow (skip detail scan)
  6. Compute traffic metrics (TI, LOS, congestion level)
  7. UPSERT to fact_traffic_flow
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Engine

from src.core.config import settings
from src.core.logger import get_logger
from src.domain.math import (
    TZ_HCM,
    calculate_congestion_level,
    calculate_los_level,
    calculate_traffic_index,
    derive_date_key,
    derive_time_key,
)
from src.domain.math.key_generator import generate_traffic_flow_key
from src.pipelines.real_time.flow_tile_extractor import FlowTileExtractor
from src.pipelines.real_time.hotspot_detector import HotspotDetector
from src.pipelines.real_time.segment_mapper import SegmentMapper
from src.pipelines.real_time.traffic_pipeline import (
    TrafficExtractor,
    TrafficTransformer,
    TrafficLoader,
)


class FlowTileOrchestrator:
    """Orchestrate flow tile → hotspot → segment detail scan pipeline."""

    def __init__(
        self,
        engine: Engine,
        key_pool=None,
        api_key: str = "",
    ):
        """Initialize orchestrator.

        Args:
            engine: SQLAlchemy engine
            key_pool: TomTomKeyPool instance (optional)
            api_key: fallback single API key
        """
        self.engine = engine
        self.key_pool = key_pool
        self.api_key = api_key

        self.tile_extractor = FlowTileExtractor(
            api_key=api_key, key_pool=key_pool
        )
        self.hotspot_detector = HotspotDetector(
            threshold=settings.flow_tile_threshold
        )
        self.segment_mapper = SegmentMapper(engine=engine)
        self.detail_extractor = TrafficExtractor(
            api_key=api_key, key_pool=key_pool
        )
        self.traffic_loader = TrafficLoader(engine=engine)

        self.logger = get_logger(self.__class__.__name__)

    def run(self) -> dict[str, Any]:
        """Execute full coarse-to-detail pipeline.

        Returns:
            stats dict with metrics on execution
        """
        stats = {
            "tiles_extracted": 0,
            "hotspots_detected": 0,
            "incident_promoted_segments": 0,
            "segments_detail_scanned": 0,
            "baseline_sampled_segments": 0,
            "segments_freeflow_marked": 0,
            "traffic_rows_upserted": 0,
            "detection_latency_minutes": None,
            "api_calls_estimated": 0,
            "errors": [],
        }

        timestamp_utc = datetime.now(TZ_HCM)
        self.logger.info("═" * 60)
        self.logger.info("Starting Flow Tile → Hotspot → Detail Scan pipeline")
        self.logger.info("Timestamp (HCM): %s", timestamp_utc.isoformat())
        self.logger.info("═" * 60)

        try:
            # Step 1: Extract flow tiles
            self.logger.info("Step 1/5: Extracting flow tiles...")
            tiles_data = self.tile_extractor.extract()
            stats["tiles_extracted"] = len(tiles_data)

            if not tiles_data:
                self.logger.warning("No tile data extracted. Aborting.")
                return stats

            # Step 2: Detect hotspots
            self.logger.info("Step 2/5: Detecting hotspots...")
            hotspots = self.hotspot_detector.detect_hotspots(tiles_data)
            stats["hotspots_detected"] = len(hotspots)

            hotspot_summary = self.hotspot_detector.get_hotspot_summary(hotspots)
            self.logger.info(
                "Hotspot summary: %s",
                {k: f"{v:.3f}" if isinstance(v, float) else v
                 for k, v in hotspot_summary.items()},
            )

            if not hotspots:
                self.logger.warning(
                    "No hotspots detected from tiles; continuing with incident promotion and free-flow inference."
                )

            # Step 3: Map tiles to segments
            self.logger.info("Step 3/5: Mapping hotspot tiles to detail segments...")
            segment_points = self.segment_mapper.get_segments_for_hotspots(hotspots)

            # Incident-driven promotion: always include segments with fresh active incidents.
            incident_segments = self.segment_mapper.get_recent_incident_segments(
                lookback_minutes=30
            )
            stats["incident_promoted_segments"] = len(incident_segments)
            for seg_key, seg_data in incident_segments.items():
                segment_points.setdefault(seg_key, seg_data)

            if incident_segments:
                avg_age = sum(v.get("incident_age_min", 0.0) for v in incident_segments.values()) / max(1, len(incident_segments))
                stats["detection_latency_minutes"] = round(avg_age, 2)

            hotspot_segment_keys = set(int(k) for k in segment_points.keys())
            stats["segments_detail_scanned"] = len(hotspot_segment_keys)

            # Non-hotspot handling: baseline rotation + inferred free-flow assignment
            non_hotspot_candidates = self.segment_mapper.get_non_hotspot_candidates(
                hotspot_segment_keys
            )
            baseline_candidates, inferred_freeflow_candidates = self.segment_mapper.sample_baseline_candidates(
                non_hotspot_candidates,
                ratio=settings.flow_tile_baseline_ratio,
            )
            stats["baseline_sampled_segments"] = len(baseline_candidates)

            for c in baseline_candidates:
                segment_points.setdefault(
                    int(c["segment_key"]),
                    {
                        "lat": float(c["lat"]),
                        "lon": float(c["lon"]),
                        "lane_count": int(c["lane_count"]),
                    },
                )

            if not segment_points and not inferred_freeflow_candidates:
                self.logger.warning("No mapped segments for detail or free-flow assignment.")
                return stats

            # Step 4: Extract detail traffic for hotspot segments
            self.logger.info(
                "Step 4/5: Extracting detail traffic flow for %d segments...",
                len(segment_points),
            )

            # Flatten unique points list aligned with segment keys.
            points: list[tuple[float, float]] = []
            segment_keys: list[int] = []
            lane_count_map: dict[int, int] = {}
            for seg_key, seg_data in segment_points.items():
                points.append((float(seg_data["lat"]), float(seg_data["lon"])))
                segment_keys.append(int(seg_key))
                lane_count_map[int(seg_key)] = int(seg_data.get("lane_count", 2))

            detail_responses = self.detail_extractor.extract(points=points)
            self.logger.info("Extracted %d detail responses", len(detail_responses))

            # Step 5: Transform + Load
            self.logger.info("Step 5/5: Transforming and loading to database...")

            transformer = TrafficTransformer(
                segment_keys=segment_keys,
                lane_count_map=lane_count_map,
            )
            transformed = transformer.transform(detail_responses)

            upserted = self.traffic_loader.load(records=transformed)
            stats["traffic_rows_upserted"] += int(upserted)
            self.logger.info("Loaded %d detail rows", int(upserted))

            # Inferred free-flow records for non-hotspot segments not baseline-sampled.
            if inferred_freeflow_candidates:
                inferred_rows = self._build_inferred_freeflow_records(
                    inferred_freeflow_candidates,
                    timestamp_utc,
                )
                if inferred_rows:
                    inferred_upserted = self.traffic_loader.load(records=inferred_rows)
                    stats["traffic_rows_upserted"] += int(inferred_upserted)
                    stats["segments_freeflow_marked"] = len(inferred_rows)
                    self.logger.info(
                        "Loaded %d inferred free-flow rows",
                        int(inferred_upserted),
                    )

            stats["api_calls_estimated"] = stats["tiles_extracted"] + len(points)

        except Exception as e:
            self.logger.exception("Pipeline error: %s", e)
            stats["errors"].append(str(e))

        self.logger.info("Pipeline complete. Stats: %s", stats)
        return stats

    def _build_inferred_freeflow_records(
        self,
        candidates: list[dict],
        ts: datetime,
    ) -> list[dict]:
        """Build inferred free-flow rows for non-hotspot segments.

        These records avoid expensive detail API calls while still keeping
        time-series continuity in fact_traffic_flow.
        """
        rows: list[dict] = []
        date_key = derive_date_key(ts)
        time_key = derive_time_key(ts)
        ts_naive = ts.replace(tzinfo=None)

        for c in candidates:
            segment_key = int(c["segment_key"])
            free_flow_speed = float(c.get("free_flow_speed_kmh", 40.0) or 40.0)
            lane_count = max(1, int(c.get("lane_count", 2) or 2))
            traffic_index = calculate_traffic_index(free_flow_speed, free_flow_speed)
            los = calculate_los_level(traffic_index)
            congestion = calculate_congestion_level(los)

            rows.append(
                {
                    "traffic_flow_key": generate_traffic_flow_key(segment_key, date_key, time_key),
                    "segment_key": segment_key,
                    "time_key": time_key,
                    "date_key": date_key,
                    "weather_key": 800,
                    "timestamp": ts_naive,
                    "pcu_volume": lane_count * 150,
                    "traffic_index": round(traffic_index, 2),
                    "current_speed_kmh": round(free_flow_speed, 2),
                    "free_flow_speed_kmh": round(free_flow_speed, 2),
                    "delay_seconds": 0,
                    "los_level": los,
                    "congestion_level": congestion,
                    "is_closed": False,
                    "is_incident_triggered": False,
                    "quality_flag": 3,
                }
            )

        return rows
