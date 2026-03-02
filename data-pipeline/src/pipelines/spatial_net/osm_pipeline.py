"""OSM Road Network Pipeline.

Extract : OSMnx download road network (District 1, HCM)
Transform: Nodes → dim_node, Edges → dim_road, dim_way, dim_segment
Load    : UPSERT theo thứ tự FK: dim_node → dim_road → dim_way → dim_segment

PostGIS: dim_node.geometry (Point), dim_segment.geometry_center (Point),
         dim_segment.geometry_linestring (LineString).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import osmnx as ox
from shapely.geometry import LineString
from sqlalchemy import Engine, text

from src.core.exceptions import DataExtractionError
from src.core.logger import get_logger
from src.domain.geo import (
    calculate_design_capacity,
    coords_to_wkt_linestring,
    coords_to_wkt_point,
    derive_node_type,
    fallback_name,
    get_frc,
    parse_lanes,
    parse_maxspeed,
)
from src.domain.geo.constants import BBOX_HCM, DEFAULT_LANE_COUNT
from src.domain.math.key_generator import generate_road_key, generate_segment_key
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer


# ═══════════════════════════════════════════════════════════
# EXTRACTOR
# ═══════════════════════════════════════════════════════════


class OSMExtractor(BaseExtractor):
    """Download road network từ OSMnx cho bounding box District 1."""

    BASE_URL = "overpass-api.de"  # informational only

    def extract(self, **kwargs: Any) -> dict:
        """Trả về dict {"nodes": GeoDataFrame, "edges": GeoDataFrame}.

        Raises:
            DataExtractionError: Khi OSMnx thất bại.
        """
        bbox = kwargs.get("bbox", BBOX_HCM)
        network_type = kwargs.get("network_type", "drive")

        self.logger.info(
            f"Downloading OSM network: bbox={bbox}, type={network_type}"
        )

        try:
            graph = ox.graph_from_bbox(
                north=bbox["max_lat"],
                south=bbox["min_lat"],
                east=bbox["max_lon"],
                west=bbox["min_lon"],
                network_type=network_type,
            )
            nodes, edges = ox.graph_to_gdfs(graph)
            self.logger.info(
                f"Extracted {len(nodes)} nodes, {len(edges)} edges"
            )
            return {"nodes": nodes, "edges": edges}

        except Exception as e:
            raise DataExtractionError(
                message="Failed to download OSM network",
                detail=str(e),
            )


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class OSMTransformer(BaseTransformer):
    """Transform OSMnx GeoDataFrames → list[dict] cho 4 target tables."""

    def transform(self, raw_data: dict) -> dict[str, list[dict]]:
        """Transform nodes + edges → dim_node, dim_road, dim_way, dim_segment.

        Returns:
            dict with 4 keys mapping to list[dict].
        """
        nodes_gdf = raw_data["nodes"]
        edges_gdf = raw_data["edges"]
        now = datetime.utcnow()

        # ── dim_node ──────────────────────────────────────
        node_records = []
        for osmid, row in nodes_gdf.iterrows():
            highway = row.get("highway", None)
            if isinstance(highway, list):
                highway = highway[0] if highway else None
            street_count = int(row.get("street_count", 0))

            node_records.append(
                {
                    "node_key": int(osmid),
                    "node_source_id": int(osmid),
                    "node_type": derive_node_type(highway, street_count),
                    "is_snapped": False,
                    "geometry_wkt": coords_to_wkt_point(row.geometry.x, row.geometry.y),
                    "record_timestamp": now,
                }
            )

        self.logger.info(f"Transformed {len(node_records)} dim_node records")

        # ── dim_road (group by road name) ─────────────────
        road_agg: dict[str, float] = {}  # name → total_length
        for _, row in edges_gdf.iterrows():
            name_raw = row.get("name", None)
            if isinstance(name_raw, list):
                name_raw = name_raw[0] if name_raw else None
            name = fallback_name(name_raw)
            length = float(row.get("length", 0.0))
            road_agg[name] = road_agg.get(name, 0.0) + length

        road_records = []
        for name, total_len in road_agg.items():
            road_records.append(
                {
                    "road_key": generate_road_key(name),
                    "name": name,
                    "total_length_m": round(total_len, 2),
                    "record_timestamp": now,
                }
            )

        self.logger.info(f"Transformed {len(road_records)} dim_road records")

        # ── dim_way (group by osmid/way) + dim_segment ────
        way_agg: dict[int, dict] = {}  # way osmid → aggregated data
        segment_records = []

        for (u, v, key), row in edges_gdf.iterrows():
            osmid_raw = row.get("osmid", key)
            if isinstance(osmid_raw, list):
                osmid_raw = osmid_raw[0]
            osmid = int(osmid_raw)

            highway = row.get("highway", "residential")
            if isinstance(highway, list):
                highway = highway[0] if highway else "residential"

            name_raw = row.get("name", None)
            if isinstance(name_raw, list):
                name_raw = name_raw[0] if name_raw else None
            road_name = fallback_name(name_raw)

            length = float(row.get("length", 0.0))
            lanes = parse_lanes(row.get("lanes", None), highway)
            maxspeed = parse_maxspeed(row.get("maxspeed", None), highway)
            oneway = bool(row.get("oneway", False))

            # Geometry
            geom = row.get("geometry", None)
            if geom is not None and hasattr(geom, "coords"):
                coords_list = list(geom.coords)
                linestring_wkt = coords_to_wkt_linestring(coords_list)
                centroid = geom.centroid
                center_wkt = coords_to_wkt_point(centroid.x, centroid.y)
            else:
                # Fallback: straight line from u → v
                ux, uy = nodes_gdf.loc[u, "x"], nodes_gdf.loc[u, "y"]
                vx, vy = nodes_gdf.loc[v, "x"], nodes_gdf.loc[v, "y"]
                linestring_wkt = coords_to_wkt_linestring([(ux, uy), (vx, vy)])
                cx, cy = (ux + vx) / 2, (uy + vy) / 2
                center_wkt = coords_to_wkt_point(cx, cy)

            seg_key = generate_segment_key(int(u), int(v), osmid)

            segment_records.append(
                {
                    "segment_key": seg_key,
                    "from_node_key": int(u),
                    "to_node_key": int(v),
                    "way_key": osmid,
                    "location_key": None,  # filled by location_pipeline
                    "segment_id_source": osmid,
                    "length_m": round(length, 2),
                    "center_wkt": center_wkt,
                    "linestring_wkt": linestring_wkt,
                    "is_one_way": oneway,
                    "record_timestamp": now,
                }
            )

            # Aggregate for dim_way
            if osmid not in way_agg:
                way_agg[osmid] = {
                    "way_key": osmid,
                    "road_key": generate_road_key(road_name),
                    "total_length_m": 0.0,
                    "direction": "Forward" if oneway else "Both",
                    "segment_count": 0,
                    "default_lane_count": lanes,
                    "design_capacity": calculate_design_capacity(lanes),
                    "default_speed_limit": maxspeed,
                    "tomtom_frc": get_frc(highway),
                    "osm_highway_type": highway,
                    "record_timestamp": now,
                }
            way_agg[osmid]["total_length_m"] += length
            way_agg[osmid]["segment_count"] += 1

        way_records = []
        for data in way_agg.values():
            data["total_length_m"] = round(data["total_length_m"], 2)
            way_records.append(data)

        self.logger.info(
            f"Transformed {len(way_records)} dim_way, "
            f"{len(segment_records)} dim_segment records"
        )

        return {
            "dim_node": node_records,
            "dim_road": road_records,
            "dim_way": way_records,
            "dim_segment": segment_records,
        }


# ═══════════════════════════════════════════════════════════
# LOADERS
# ═══════════════════════════════════════════════════════════


class NodeLoader(BaseLoader):
    """UPSERT dim_node (có PostGIS geometry → raw SQL)."""

    TABLE_NAME = "dim_node"
    CONFLICT_KEYS = ["node_key"]
    UPDATE_COLUMNS = ["node_type", "is_snapped", "record_timestamp"]
    BATCH_SIZE = 1000

    _SQL = """
        INSERT INTO dim_node (node_key, node_source_id, node_type, is_snapped, geometry, record_timestamp)
        VALUES (:node_key, :node_source_id, :node_type, :is_snapped,
                ST_GeomFromText(:geometry_wkt, 4326), :record_timestamp)
        ON CONFLICT (node_key) DO UPDATE SET
            node_type = EXCLUDED.node_type,
            is_snapped = EXCLUDED.is_snapped,
            record_timestamp = EXCLUDED.record_timestamp
    """

    def load(self, records: list[dict]) -> int:
        return self._upsert_raw_sql(self._SQL, records)


class RoadLoader(BaseLoader):
    TABLE_NAME = "dim_road"
    CONFLICT_KEYS = ["road_key"]
    UPDATE_COLUMNS = ["total_length_m", "record_timestamp"]
    BATCH_SIZE = 200

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


class WayLoader(BaseLoader):
    TABLE_NAME = "dim_way"
    CONFLICT_KEYS = ["way_key"]
    UPDATE_COLUMNS = ["total_length_m", "segment_count", "record_timestamp"]
    BATCH_SIZE = 500

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


class SegmentLoader(BaseLoader):
    """UPSERT dim_segment (2 PostGIS geometry columns → raw SQL)."""

    TABLE_NAME = "dim_segment"
    CONFLICT_KEYS = ["segment_key"]
    UPDATE_COLUMNS = ["length_m", "is_one_way", "record_timestamp"]
    BATCH_SIZE = 500

    _SQL = """
        INSERT INTO dim_segment (
            segment_key, from_node_key, to_node_key, way_key, location_key,
            segment_id_source, length_m, geometry_center, geometry_linestring,
            is_one_way, record_timestamp
        ) VALUES (
            :segment_key, :from_node_key, :to_node_key, :way_key, :location_key,
            :segment_id_source, :length_m,
            ST_GeomFromText(:center_wkt, 4326),
            ST_GeomFromText(:linestring_wkt, 4326),
            :is_one_way, :record_timestamp
        )
        ON CONFLICT (segment_key) DO UPDATE SET
            length_m = EXCLUDED.length_m,
            is_one_way = EXCLUDED.is_one_way,
            record_timestamp = EXCLUDED.record_timestamp
    """

    def load(self, records: list[dict]) -> int:
        return self._upsert_raw_sql(self._SQL, records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, **kwargs) -> int:
    """Chạy full ETL cho OSM road network.

    FK insert order: dim_node → dim_road → dim_way → dim_segment.

    Returns:
        int: Tổng record đã upsert.
    """
    logger = get_logger("osm_pipeline")
    total = 0

    # E
    extractor = OSMExtractor()
    raw = extractor.extract(**kwargs)

    # T
    transformer = OSMTransformer()
    data = transformer.transform(raw)

    # L – FK order
    load_order: list[tuple[str, BaseLoader, list[dict]]] = [
        ("dim_node", NodeLoader(engine), data["dim_node"]),
        ("dim_road", RoadLoader(engine), data["dim_road"]),
        ("dim_way", WayLoader(engine), data["dim_way"]),
        ("dim_segment", SegmentLoader(engine), data["dim_segment"]),
    ]

    for name, loader, records in load_order:
        count = loader.load(records)
        logger.info(f"Loaded {count} records → {name}")
        total += count

    return total
