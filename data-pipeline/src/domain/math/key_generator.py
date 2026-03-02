"""Key Generation Functions for Traffic Entities.

Generates idempotent BIGINT keys for various traffic dimension tables.
Uses SHA256 hashing to ensure same input produces same key (lũy đẳng).
"""

from __future__ import annotations

import hashlib


def generate_segment_key(from_node: int, to_node: int, osmid: int) -> int:
    """Generate idempotent segment_key from OSM edge identifiers.

    Combines from_node, to_node, and osmid using SHA256 hash.

    Args:
        from_node: OSM node ID (start)
        to_node: OSM node ID (end)
        osmid: OSM way ID

    Returns:
        int: Segment key (BIGINT, 15 hex digits)
    """
    raw = f"{from_node}:{to_node}:{osmid}"
    hex_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def generate_incident_key(incident_id: str) -> int:
    """Generate idempotent incident_key from external incident ID.

    Args:
        incident_id: External incident identifier

    Returns:
        int: Incident key (BIGINT)
    """
    hex_hash = hashlib.sha256(incident_id.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def generate_road_key(road_name: str) -> int:
    """Generate idempotent road_key from road name.

    Args:
        road_name: Official road name (e.g., "Võ Văn Kiệt")

    Returns:
        int: Road key (BIGINT)
    """
    hex_hash = hashlib.sha256(road_name.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def generate_corridor_key(corridor_name: str) -> int:
    """Generate idempotent corridor_key from corridor name.

    Args:
        corridor_name: Corridor/arterial route name

    Returns:
        int: Corridor key (BIGINT)
    """
    hex_hash = hashlib.sha256(corridor_name.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def generate_traffic_flow_key(segment_key: int, date_key: int, time_key: int) -> int:
    """Generate surrogate traffic_flow_key from dimension keys.

    Combines segment_key, date_key, and time_key.

    Args:
        segment_key: Physical segment identifier
        date_key: Date in YYYYMMDD format
        time_key: Time of day in minutes (0-1439)

    Returns:
        int: Traffic flow fact key (BIGINT)
    """
    raw = f"{segment_key}:{date_key}:{time_key}"
    hex_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)
