"""Pydantic V2 schemas cho OpenStreetMap data (via OSMnx / Overpass).

Classes:
    OSMNode, OSMEdge, TrafficSignalNode
"""

from __future__ import annotations

from pydantic import BaseModel


class OSMNode(BaseModel):
    """Validate one OSM node (from GeoDataFrame → dict)."""

    osmid: int
    x: float  # longitude
    y: float  # latitude
    street_count: int = 0
    highway: str | None = None


class OSMEdge(BaseModel):
    """Validate one OSM edge (from GeoDataFrame → dict)."""

    from_node: int  # u (edge_key[0])
    to_node: int  # v (edge_key[1])
    osmid: int
    name: str | None = None
    highway: str
    length: float
    oneway: bool = False
    lanes: str | int | list | None = None
    maxspeed: str | int | None = None
    geometry_wkt: str  # WKT LineString


class TrafficSignalNode(BaseModel):
    """Validate one traffic signal node (from Overpass)."""

    osmid: int
    lat: float
    lon: float
    highway: str = "traffic_signals"
    crossing: str | None = None
