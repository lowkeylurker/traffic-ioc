"""Schemas layer – Data Contracts (Pydantic V2).

Re-exports tất cả schema classes.
"""

from src.schemas.osm_schema import OSMEdge, OSMNode, TrafficSignalNode
from src.schemas.tomtom_schema import (
    TomTomCoordinate,
    TomTomCoordinates,
    TomTomFlowResponse,
    TomTomFlowSegment,
    TomTomIncidentFeature,
    TomTomIncidentGeometry,
    TomTomIncidentProperties,
    TomTomIncidentResponse,
)
from src.schemas.weather_schema import (
    ForecastCity,
    ForecastItem,
    ForecastResponse,
    WeatherCondition,
    WeatherMain,
    WeatherRain,
    WeatherResponse,
    WeatherWind,
)

__all__ = [
    # TomTom
    "TomTomCoordinate",
    "TomTomCoordinates",
    "TomTomFlowSegment",
    "TomTomFlowResponse",
    "TomTomIncidentGeometry",
    "TomTomIncidentProperties",
    "TomTomIncidentFeature",
    "TomTomIncidentResponse",
    # Weather
    "WeatherCondition",
    "WeatherMain",
    "WeatherWind",
    "WeatherRain",
    "WeatherResponse",
    "ForecastItem",
    "ForecastCity",
    "ForecastResponse",
    # OSM
    "OSMNode",
    "OSMEdge",
    "TrafficSignalNode",
]
