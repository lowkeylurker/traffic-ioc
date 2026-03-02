"""Corridor & Corridor-Segment Bridge Configuration Pipeline.

Static configuration for traffic corridors (major arterial routes).
  - dim_corridor: Master list of traffic corridors (e.g., "Nam Kỳ Khởi Nghĩa East-West Corridor")
  - bridge_corridor_segment: Bridge table connecting corridors to segments with sequence order

Source: Static config (corridors_config.json or hardcoded list)
Strategy: Full DELETE + INSERT for bridge table (to handle route restructuring)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Engine, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.core.exceptions import DatabaseLoadError
from src.core.logger import get_logger
from src.domain.math.key_generator import generate_corridor_key
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer, get_table


# ═══════════════════════════════════════════════════════════
# EXTRACTOR
# ═══════════════════════════════════════════════════════════


class CorridorExtractor(BaseExtractor):
    """Load corridor config from static source (JSON file or hardcoded list).
    
    Returns dict with 'corridors' key containing list of corridor configs.
    """

    def extract(self, **kwargs: Any) -> dict:
        """Extract corridor config.
        
        For MVP: Return hardcoded sample data.
        In production: Load from corridors_config.json.
        """
        # Sample HCM corridors
        corridors_data = [
            {
                "corridor_name": "Nam Kỳ Khởi Nghĩa Inbound",
                "importance_level": 3,
                "target_avg_speed_kmh": 45.0,
                "total_length_m": 1250.5,
                "direction": "Inbound",
                "is_active": True,
                "segments": [
                    {"segment_id_source": 817909615, "sequence_order": 1},
                    {"segment_id_source": 817909616, "sequence_order": 2},
                    {"segment_id_source": 817909617, "sequence_order": 3},
                ],
            },
            {
                "corridor_name": "Lê Lợi East-West",
                "importance_level": 2,
                "target_avg_speed_kmh": 50.0,
                "total_length_m": 2100.75,
                "direction": "East-West",
                "is_active": True,
                "segments": [
                    {"segment_id_source": 817909618, "sequence_order": 1},
                    {"segment_id_source": 817909619, "sequence_order": 2},
                ],
            },
        ]
        
        self.logger.info(f"Extracted {len(corridors_data)} corridor configs")
        return {"corridors": corridors_data}


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class CorridorTransformer(BaseTransformer):
    """Transform corridor configs → dim_corridor + bridge_corridor_segment records."""

    def transform(self, raw_data: dict) -> dict[str, list[dict]]:
        """Transform raw corridor configs.
        
        Returns:
            dict with 'dim_corridor' and 'bridge_corridor_segment' keys.
        """
        corridors_data = raw_data.get("corridors", [])
        now = datetime.utcnow()

        corridor_records = []
        bridge_records = []

        for corridor_cfg in corridors_data:
            corridor_name = corridor_cfg["corridor_name"]
            corridor_key = generate_corridor_key(corridor_name)

            # ── dim_corridor record ────────────────────────────────
            corridor_records.append({
                "corridor_key": corridor_key,
                "corridor_name": corridor_name,
                "importance_level": corridor_cfg.get("importance_level", 5),
                "target_avg_speed_kmh": float(corridor_cfg.get("target_avg_speed_kmh", 40.0)),
                "total_length_m": float(corridor_cfg.get("total_length_m", 0.0)),
                "direction": corridor_cfg.get("direction", "Unknown"),
                "is_active": corridor_cfg.get("is_active", True),
                "record_timestamp": now,
            })

            # ── bridge_corridor_segment records ────────────────────
            # Segments must respect sequence_order (1, 2, 3, ...)
            segments = corridor_cfg.get("segments", [])
            for seg_cfg in segments:
                bridge_records.append({
                    "corridor_key": corridor_key,
                    "segment_key": int(seg_cfg["segment_id_source"]),  # Direct mapping to OSM segment
                    "sequence_order": int(seg_cfg["sequence_order"]),
                    "record_timestamp": now,
                })

        self.logger.info(
            f"Transformed {len(corridor_records)} corridor, "
            f"{len(bridge_records)} bridge_corridor_segment records"
        )

        return {
            "dim_corridor": corridor_records,
            "bridge_corridor_segment": bridge_records,
        }


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class CorridorLoader(BaseLoader):
    """Loader for dim_corridor table (standard UPSERT).
    
    Conflict target: corridor_key
    Update on conflict: corridor_name, direction, is_active, target_avg_speed_kmh
    """

    TABLE_NAME = "dim_corridor"
    CONFLICT_KEYS = ["corridor_key"]
    UPDATE_COLUMNS = [
        "corridor_name",
        "importance_level",
        "target_avg_speed_kmh",
        "total_length_m",
        "direction",
        "is_active",
        "record_timestamp",
    ]
    BATCH_SIZE = 100

    def load(self, records: list[dict]) -> int:
        """UPSERT corridor records."""
        return self._upsert_batch(records)


class BridgeCorridorSegmentLoader(BaseLoader):
    """Loader for bridge_corridor_segment table (DELETE + INSERT strategy).
    
    This loader is part of load_corridors() transaction to handle route restructuring.
    """

    TABLE_NAME = "bridge_corridor_segment"
    CONFLICT_KEYS = ["corridor_key", "sequence_order"]
    UPDATE_COLUMNS = []
    BATCH_SIZE = 1000

    def load(self, records: list[dict]) -> int:
        """Standard UPSERT for bridge records."""
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# TRANSACTION MANAGER
# ═══════════════════════════════════════════════════════════


def load_corridors(
    engine: Engine,
    corridor_records: list[dict],
    bridge_records: list[dict],
) -> dict[str, int]:
    """Load corridors with full transaction control.
    
    Strategy (per spec):
    1. UPSERT dim_corridor → returns list of corridor_keys
    2. DELETE FROM bridge_corridor_segment WHERE corridor_key IN (updated keys)
    3. INSERT INTO bridge_corridor_segment (bulk insert)
    
    All in ONE transaction with rollback on error.
    
    Args:
        engine: SQLAlchemy Engine
        corridor_records: List of dim_corridor records
        bridge_records: List of bridge_corridor_segment records
    
    Returns:
        dict with counts: {"corridors_upserted": int, "bridge_deleted": int, "bridge_inserted": int}
    
    Raises:
        DatabaseLoadError: On transaction failure with auto-rollback
    """
    logger = get_logger("load_corridors")
    
    result = {
        "corridors_upserted": 0,
        "bridge_deleted": 0,
        "bridge_inserted": 0,
    }

    if not corridor_records:
        logger.warning("No corridor records to load")
        return result

    try:
        with Session(engine) as session:
            with session.begin():
                # ────────────────────────────────────────────────
                # STEP 1: UPSERT dim_corridor
                # ────────────────────────────────────────────────
                corridor_loader = CorridorLoader(engine)
                corridors_upserted = corridor_loader.load(corridor_records)
                result["corridors_upserted"] = corridors_upserted
                logger.info(f"✓ Upserted {corridors_upserted} dim_corridor records")

                # Extract corridor_keys that were upserted
                corridor_keys = [r["corridor_key"] for r in corridor_records]

                # ────────────────────────────────────────────────
                # STEP 2: DELETE old bridge records for these corridors
                # (Full replace strategy)
                # ────────────────────────────────────────────────
                if corridor_keys:
                    # Build IN clause for batch delete
                    placeholders = ", ".join(f":{i}" for i in range(len(corridor_keys)))
                    delete_sql = (
                        f"DELETE FROM bridge_corridor_segment "
                        f"WHERE corridor_key IN ({placeholders})"
                    )
                    params = {str(i): k for i, k in enumerate(corridor_keys)}
                    
                    result_delete = session.execute(
                        text(delete_sql),
                        params,
                    )
                    result["bridge_deleted"] = result_delete.rowcount
                    logger.info(
                        f"✓ Deleted {result['bridge_deleted']} old bridge_corridor_segment records"
                    )

                # ────────────────────────────────────────────────
                # STEP 3: INSERT new bridge records (bulk)
                # ────────────────────────────────────────────────
                if bridge_records:
                    bridge_table = get_table("bridge_corridor_segment", engine)
                    insert_stmt = pg_insert(bridge_table).values(bridge_records)
                    
                    result_insert = session.execute(insert_stmt)
                    result["bridge_inserted"] = len(bridge_records)
                    logger.info(
                        f"✓ Inserted {result['bridge_inserted']} new bridge_corridor_segment records"
                    )

                # Transaction auto-commits here (successful session.begin() context exit)
                logger.info(
                    f"✅ Corridor load transaction committed: "
                    f"corridors={result['corridors_upserted']}, "
                    f"bridge_deleted={result['bridge_deleted']}, "
                    f"bridge_inserted={result['bridge_inserted']}"
                )

    except Exception as e:
        logger.error(f"❌ Corridor load transaction failed: {e}")
        # Session auto-rollbacks here (exception in context manager)
        raise DatabaseLoadError(
            message="Failed to load corridors (dim_corridor + bridge_corridor_segment)",
            detail=str(e),
        )

    return result


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, **kwargs) -> int:
    """Execute full corridor ETL pipeline.
    
    Returns:
        int: Total records loaded (corridors + bridge)
    """
    logger = get_logger("corridor_pipeline")

    # Extract
    extractor = CorridorExtractor()
    raw_data = extractor.extract(**kwargs)

    # Transform
    transformer = CorridorTransformer()
    transformed = transformer.transform(raw_data)

    corridor_records = transformed["dim_corridor"]
    bridge_records = transformed["bridge_corridor_segment"]

    # Load (with transaction)
    result = load_corridors(engine, corridor_records, bridge_records)

    total = result["corridors_upserted"] + result["bridge_inserted"]
    logger.info(f"[run-corridor] {total} total records loaded")

    return total
