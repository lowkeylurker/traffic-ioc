"""Pydantic V2 schemas cho TomTom Traffic Flow & Incident APIs.

Classes:
    TomTomCoordinate, TomTomCoordinates, TomTomFlowSegment, TomTomFlowResponse
    TomTomIncidentGeometry, TomTomIncidentProperties, TomTomIncidentFeature, TomTomIncidentResponse
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ══════════════════════════════════════════════════════════
# TRAFFIC FLOW API v4
# ══════════════════════════════════════════════════════════


class TomTomCoordinate(BaseModel):
    """Một cặp tọa độ TomTom (lat, lon)."""

    latitude: float
    longitude: float


class TomTomCoordinates(BaseModel):
    """Wrapper cho danh sách tọa độ."""

    coordinate: list[TomTomCoordinate]


class TomTomFlowSegment(BaseModel):
    """Validate flowSegmentData từ TomTom Traffic Flow API v4."""

    model_config = ConfigDict(populate_by_name=True)

    frc: str
    current_speed: float = Field(alias="currentSpeed", ge=0)
    free_flow_speed: float = Field(alias="freeFlowSpeed", gt=0)
    current_travel_time: int = Field(alias="currentTravelTime", ge=0)
    free_flow_travel_time: int = Field(alias="freeFlowTravelTime", ge=0)
    confidence: float = Field(ge=0.0, le=1.0)
    road_closure: bool = Field(alias="roadClosure", default=False)
    coordinates: TomTomCoordinates

    @field_validator("free_flow_speed")
    @classmethod
    def speed_must_be_positive(cls, v: float) -> float:
        """free_flow_speed must be > 0 to avoid ZeroDivisionError."""
        if v <= 0:
            raise ValueError("free_flow_speed must be > 0")
        return v


class TomTomFlowResponse(BaseModel):
    """Top-level response wrapper cho Traffic Flow API."""

    model_config = ConfigDict(populate_by_name=True)

    flow_segment_data: TomTomFlowSegment = Field(alias="flowSegmentData")


# ══════════════════════════════════════════════════════════
# INCIDENT DETAILS API v5
# ══════════════════════════════════════════════════════════


class TomTomIncidentGeometry(BaseModel):
    """GeoJSON geometry cho incident (LineString)."""

    type: str
    coordinates: list[list[float]]  # [[lon, lat], ...]


class TomTomIncidentProperties(BaseModel):
    """Validate incident properties từ TomTom Incident API v5."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    icon_category: int = Field(alias="iconCategory")
    magnitude_of_delay: int | None = Field(default=0, alias="magnitudeOfDelay")
    start_time: str = Field(alias="startTime")
    end_time: str | None = Field(default=None, alias="endTime")
    delay: int | None = Field(default=0)
    length: float | None = None
    from_road: str | None = Field(default=None, alias="from")
    to_road: str | None = Field(default=None, alias="to")
    events: list[dict] | None = None


class TomTomIncidentFeature(BaseModel):
    """Một GeoJSON Feature cho incident."""

    type: str  # "Feature"
    geometry: TomTomIncidentGeometry
    properties: TomTomIncidentProperties


class TomTomIncidentResponse(BaseModel):
    """Top-level response wrapper cho Incident API."""

    incidents: list[TomTomIncidentFeature]
