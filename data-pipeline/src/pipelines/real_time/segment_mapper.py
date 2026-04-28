"""Segment Mapper – Map hotspot tiles to nearby segments using PostGIS.

Given a set of hotspot tiles, find all segments within tile bounds + buffer,
then return segment coordinates for detail Traffic Flow API scanning.
"""

from __future__ import annotations

from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from src.core.config import settings
from src.core.logger import get_logger
from src.pipelines.real_time.hotspot_detector import Hotspot


class SegmentMapper:
    """Map hotspot tiles → segments using PostGIS."""

    def __init__(self, engine: Engine):
        """Initialize with database engine."""
        self.engine = engine
        self.logger = get_logger(self.__class__.__name__)
        self.buffer_m = settings.flow_tile_buffer_m

    def tile_to_bbox(
        self, tile_z: int, tile_x: int, tile_y: int
    ) -> tuple[float, float, float, float]:
        """Convert Web Mercator tile to bbox (min_lat, min_lon, max_lat, max_lon).

        Zoom 15 tile = ~40km coverage per tile globally.
        In HCM, each tile ≈ ~2-3 km x ~3 km due to lat.
        """
        from math import atan, pi, sinh

        def _tile_to_latlon(tile_x: int, tile_y: int, zoom: int):
            """Tile (x, y, zoom) → (lat, lon) for top-left corner."""
            n = 2 ** zoom
            lon = (tile_x / n) * 360 - 180
            lat_rad = atan(sinh(pi * (1 - 2 * tile_y / n)))
            lat = lat_rad * 180 / pi
            return lat, lon

        # Top-left corner
        lat_max, lon_min = _tile_to_latlon(tile_x, tile_y, tile_z)
        # Bottom-right corner
        lat_min, lon_max = _tile_to_latlon(tile_x + 1, tile_y + 1, tile_z)

        return lat_min, lon_min, lat_max, lon_max

    def get_segments_for_tile(self, hotspot: Hotspot) -> list[dict]:
        """Fetch segments within tile + buffer using PostGIS ST_DWithin.

        Returns:
            list of {segment_id, geometry_center_lat, geometry_center_lon, segment_name}
        """
        try:
            lat_min, lon_min, lat_max, lon_max = self.tile_to_bbox(
                hotspot.tile_z, hotspot.tile_x, hotspot.tile_y
            )

            # Create bbox polygon and query nearby segments
            sql = text("""
                SELECT
                    ds.segment_key,
                    ST_Y(ds.geometry_center) AS lat,
                    ST_X(ds.geometry_center) AS lon,
                    COALESCE(w.default_lane_count, 2) AS lane_count
                FROM dim_segment ds
                LEFT JOIN dim_way w ON w.way_key = ds.way_key
                WHERE
                    ds.geometry_center IS NOT NULL
                    AND (
                        ST_Intersects(ds.geometry_center, ST_GeomFromText(:bbox_wkt, 4326))
                        OR ST_DWithin(
                            ds.geometry_center::geography,
                            ST_GeomFromText(:bbox_wkt, 4326)::geography,
                            :buffer_m
                        )
                    )
                    AND ds.geometry_center IS NOT NULL
                LIMIT :max_segs
            """)

            # Create WKT bbox
            bbox_wkt = f"POLYGON(({lon_min} {lat_min}, {lon_max} {lat_min}, {lon_max} {lat_max}, {lon_min} {lat_max}, {lon_min} {lat_min}))"

            with self.engine.connect() as conn:
                result = conn.execute(
                    sql,
                    {
                        "bbox_wkt": bbox_wkt,
                        "buffer_m": self.buffer_m,
                        "max_segs": settings.flow_tile_max_segments_per_tile,
                    },
                )
                rows = result.fetchall()
                segments = [
                    {
                        "segment_key": int(row[0]),
                        "lat": row[1],
                        "lon": row[2],
                        "lane_count": int(row[3] or 2),
                    }
                    for row in rows
                ]

            self.logger.debug(
                "Tile (%d,%d,%d) → %d segments (buffer=%dm)",
                hotspot.tile_z,
                hotspot.tile_x,
                hotspot.tile_y,
                len(segments),
                self.buffer_m,
            )
            return segments

        except SQLAlchemyError as e:
            self.logger.error(
                "Database error mapping tile (%d,%d,%d): %s",
                hotspot.tile_z,
                hotspot.tile_x,
                hotspot.tile_y,
                e,
            )
            return []

    def get_segments_for_hotspots(
        self, hotspots: set[Hotspot]
    ) -> dict[int, dict]:
        """Map all hotspots to segment coordinates.

        Returns:
            dict[segment_key] = {lat, lon, lane_count}
        """
        segment_points: dict[int, dict] = {}

        for hotspot in hotspots:
            segments = self.get_segments_for_tile(hotspot)
            for seg in segments:
                segment_key = int(seg["segment_key"])
                segment_points[segment_key] = {
                    "lat": float(seg["lat"]),
                    "lon": float(seg["lon"]),
                    "lane_count": int(seg["lane_count"]),
                }

        self.logger.info(
            "Mapped %d hotspots → %d unique segments",
            len(hotspots),
            len(segment_points),
        )
        return segment_points

    def get_recent_incident_segments(self, lookback_minutes: int = 30) -> dict[int, dict]:
        """Return segments with recent active incidents to promote detail scan.

        Returns:
            dict[segment_key] = {lat, lon, lane_count, incident_age_min}
        """
        sql = text(
            """
            SELECT
                i.segment_key,
                ST_Y(s.geometry_center) AS lat,
                ST_X(s.geometry_center) AS lon,
                COALESCE(w.default_lane_count, 2) AS lane_count,
                EXTRACT(EPOCH FROM (NOW() - MAX(i.timestamp))) / 60.0 AS incident_age_min
            FROM fact_incident i
            JOIN dim_segment s ON s.segment_key = i.segment_key
            LEFT JOIN dim_way w ON w.way_key = s.way_key
            WHERE i.timestamp >= (NOW() - (:lookback_minutes || ' minutes')::interval)
              AND COALESCE(i.is_active, TRUE) = TRUE
              AND s.geometry_center IS NOT NULL
            GROUP BY i.segment_key, s.geometry_center, w.default_lane_count
            """
        )

        try:
            with self.engine.connect() as conn:
                rows = conn.execute(sql, {"lookback_minutes": int(lookback_minutes)}).fetchall()
            promoted: dict[int, dict] = {}
            for row in rows:
                seg_key = int(row[0])
                promoted[seg_key] = {
                    "lat": float(row[1]),
                    "lon": float(row[2]),
                    "lane_count": int(row[3] or 2),
                    "incident_age_min": float(row[4] or 0.0),
                }
            return promoted
        except SQLAlchemyError as e:
            self.logger.warning("Cannot load recent incident segments: %s", e)
            return {}

    def get_non_hotspot_candidates(self, hotspot_segment_keys: set[int]) -> list[dict]:
        """Fetch non-hotspot segments with calibration fields.

        Returns list of dict with: segment_key, lat, lon, lane_count, free_flow_speed_kmh
        """
        sql = text(
            """
            WITH recent_ff AS (
                SELECT f.segment_key,
                       AVG(NULLIF(f.free_flow_speed_kmh, 0)) AS ff_kmh
                FROM fact_traffic_flow f
                WHERE f.timestamp >= (NOW() - INTERVAL '14 days')
                GROUP BY f.segment_key
            )
            SELECT
                s.segment_key,
                ST_Y(s.geometry_center) AS lat,
                ST_X(s.geometry_center) AS lon,
                COALESCE(w.default_lane_count, 2) AS lane_count,
                COALESCE(rf.ff_kmh, 40.0) AS free_flow_speed_kmh
            FROM dim_segment s
            LEFT JOIN dim_way w ON w.way_key = s.way_key
            LEFT JOIN recent_ff rf ON rf.segment_key = s.segment_key
            WHERE s.geometry_center IS NOT NULL
            """
        )
        try:
            with self.engine.connect() as conn:
                rows = conn.execute(sql).fetchall()

            candidates = []
            for row in rows:
                seg_key = int(row[0])
                if seg_key in hotspot_segment_keys:
                    continue
                candidates.append(
                    {
                        "segment_key": seg_key,
                        "lat": float(row[1]),
                        "lon": float(row[2]),
                        "lane_count": int(row[3] or 2),
                        "free_flow_speed_kmh": float(row[4] or 40.0),
                    }
                )
            return candidates
        except SQLAlchemyError as e:
            self.logger.error("Error loading non-hotspot candidates: %s", e)
            return []

    @staticmethod
    def sample_baseline_candidates(
        candidates: list[dict],
        ratio: float,
    ) -> tuple[list[dict], list[dict]]:
        """Split non-hotspot candidates into baseline-sampled and inferred-freeflow lists."""
        if not candidates:
            return [], []

        ratio = max(0.0, min(1.0, float(ratio)))
        sample_size = int(len(candidates) * ratio)
        if ratio > 0 and sample_size == 0:
            sample_size = 1

        # Deterministic sampling by segment_key order for repeatability.
        ordered = sorted(candidates, key=lambda x: int(x["segment_key"]))
        sampled = ordered[:sample_size]
        inferred = ordered[sample_size:]
        return sampled, inferred
