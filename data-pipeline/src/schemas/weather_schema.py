"""Pydantic V2 schemas cho OpenWeatherMap Current Weather 2.5 & Forecast 5d/3h.

Classes:
    WeatherCondition, WeatherMain, WeatherWind, WeatherRain, WeatherResponse
    ForecastItem, ForecastCity, ForecastResponse
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class WeatherCondition(BaseModel):
    """Validate weather condition entry."""

    id: int = Field(ge=200, le=900)
    main: str
    description: str | None = None
    icon: str | None = None


class WeatherMain(BaseModel):
    """Validate main weather data."""

    temp: float
    feels_like: float | None = None
    humidity: int


class WeatherWind(BaseModel):
    """Validate wind data."""

    speed: float
    deg: int | None = None
    gust: float | None = None


class WeatherRain(BaseModel):
    """Validate rain data (alias '1h' → 'one_hour')."""

    model_config = ConfigDict(populate_by_name=True)

    one_hour: float | None = Field(default=None, alias="1h")


class WeatherResponse(BaseModel):
    """Top-level response cho OpenWeatherMap Current Weather 2.5 API."""

    model_config = ConfigDict(populate_by_name=True)

    weather: list[WeatherCondition]  # Luôn có ít nhất 1 phần tử
    main: WeatherMain
    visibility: int | None = None
    wind: WeatherWind | None = None
    rain: WeatherRain | None = None
    dt: int
    timezone: int  # Offset giây vs UTC (25200 = +7h)
    name: str | None = None


# ══════════════════════════════════════════════════════════
# FORECAST 5d/3h
# ══════════════════════════════════════════════════════════


class ForecastItem(BaseModel):
    """Một item trong Forecast 5d/3h list."""

    dt: int
    main: WeatherMain
    weather: list[WeatherCondition]
    wind: WeatherWind | None = None
    visibility: int | None = None
    pop: float | None = None  # Probability of precipitation 0.0–1.0
    dt_txt: str | None = None  # "YYYY-MM-DD HH:MM:SS" UTC


class ForecastCity(BaseModel):
    """City info trong Forecast response."""

    id: int
    name: str
    timezone: int


class ForecastResponse(BaseModel):
    """Top-level response cho OpenWeatherMap Forecast 5d/3h API."""

    model_config = ConfigDict(populate_by_name=True)

    cod: str
    cnt: int
    items: list[ForecastItem] = Field(alias="list")
    city: ForecastCity
