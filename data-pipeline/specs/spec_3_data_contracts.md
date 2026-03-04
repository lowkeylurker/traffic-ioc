# SPEC 3 – HỢP ĐỒNG DỮ LIỆU (DATA CONTRACTS)

## Định nghĩa cấu trúc JSON thô, Field Contracts, Pydantic Schema và quy tắc Transform cho mọi nguồn dữ liệu

| Metadata | Giá trị |
|:---------|:--------|
| **Phiên bản** | 2.0 |
| **Ngày cập nhật** | 2026-02-28 |
| **Phạm vi** | Tất cả nguồn API & data source được khai thác trong `data-pipeline/` |
| **Specs liên quan** | `spec_1` (kiến trúc), `spec_2` (interface), `spec_4` (business logic), `spec_5` (target mapping) |
| **DB Schema** | `infrastructure/postgres/2_create_dims.sql`, `3_create_facts.sql` |
| **Pipeline code** | `data-pipeline/src/schemas/`, `data-pipeline/src/pipelines/` |

---

## MỤC ĐÍCH

File này là **"hợp đồng dữ liệu"** (Data Contract) giữa API bên ngoài và ETL Pipeline.
Mỗi API source được mô tả đầy đủ:

1. **Raw JSON** – Cấu trúc JSON chính xác từ API response.
2. **Field Contract** – Bảng ánh xạ: JSON path → Kiểu dữ liệu → Nullable → Cột DW.
3. **Pydantic Schema** – Class definition cho `src/schemas/*.py`.
4. **Alias Mapping** – camelCase (API) → snake_case (Python).
5. **Derived Fields** – Các trường tính toán từ raw data.
6. **Transform Rules** – Hàm biến đổi chính xác, tham chiếu `spec_4`.
7. **Fallback Rules** – Giá trị mặc định khi API trả về null/thiếu.

> **QUY TẮC:** Agent khi viết code Extract / Transform / Schema **BẮT BUỘC** phải tuân thủ đúng cấu trúc này. Bất kỳ field nào không có trong contract đều bị BỎ QUA, không lưu vào DB.

---

## MỤC LỤC

1. [TomTom Traffic Flow API v4](#1-tomtom-traffic-flow-api-v4)
2. [TomTom Incident Details API v5](#2-tomtom-incident-details-api-v5)
3. [TomTom Routing API](#3-tomtom-routing-api)
4. [TomTom Snap-to-Roads API](#4-tomtom-snap-to-roads-api)
5. [OpenWeatherMap – Current Weather 2.5](#5-openweathermap--current-weather-25)
6. [OpenWeatherMap – Forecast 5d/3h](#6-openweathermap--forecast-5d3h)
7. [OpenStreetMap – Nodes (via OSMnx)](#7-openstreetmap--nodes-via-osmnx)
8. [OpenStreetMap – Edges (via OSMnx)](#8-openstreetmap--edges-via-osmnx)
9. [OpenStreetMap – Traffic Signals (via Overpass)](#9-openstreetmap--traffic-signals-via-overpass)
10. [SerpApi – Google Events](#10-serpapi--google-events)
11. [SerpApi – Google Local (POI)](#11-serpapi--google-local-poi)
12. [SerpApi – Google News](#12-serpapi--google-news)
13. [Mapping tổng hợp: API Field → DW Column](#13-mapping-tổng-hợp-api-field--dw-column)
14. [Phụ lục A: Tham số cố định cho TP.HCM](#phụ-lục-a-tham-số-cố-định-cho-tphcm)
15. [Phụ lục B: API Rate Limits & Quotas](#phụ-lục-b-api-rate-limits--quotas)

---

## 1. TomTom Traffic Flow API v4

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `GET https://api.tomtom.com/traffic/services/4/flowSegmentData/{style}/{zoom}/{point}.{format}` |
| **Tham số bắt buộc** | `key`, `style=absolute`, `zoom=10`, `point={lat},{lon}`, `format=json` |
| **Tần suất gọi** | Mỗi 15 phút (cron real-time) |
| **Pipeline file** | `src/pipelines/real_time/traffic_pipeline.py` |
| **Schema file** | `src/schemas/tomtom_schema.py` → `TomTomFlowResponse`, `TomTomFlowSegment` |
| **Load vào** | `fact_traffic_flow` |

### 1.1 Raw JSON Response

```json
{
    "flowSegmentData": {
        "frc": "FRC4",
        "currentSpeed": 17,
        "freeFlowSpeed": 24,
        "currentTravelTime": 465,
        "freeFlowTravelTime": 329,
        "confidence": 1.0,
        "roadClosure": false,
        "coordinates": {
            "coordinate": [
                { "latitude": 10.770862, "longitude": 106.702496 },
                { "latitude": 10.775383, "longitude": 106.700562 },
                { "latitude": 10.785882, "longitude": 106.690004 }
            ]
        },
        "@version": "4"
    }
}
```

### 1.2 Field Contract

| JSON Path | Python Type | Nullable | DW Column | Ghi chú |
|:----------|:-----------|:--------:|:----------|:--------|
| `flowSegmentData.frc` | `str` | No | `dim_way.tomtom_frc` (sau parse) | `"FRC0"`–`"FRC6"`, strip prefix `"FRC"` → `int` |
| `flowSegmentData.currentSpeed` | `float` | No | `fact_traffic_flow.current_speed_kmh` | km/h, DECIMAL(5,2) |
| `flowSegmentData.freeFlowSpeed` | `float` | No | `fact_traffic_flow.free_flow_speed_kmh` | km/h, DECIMAL(5,2) |
| `flowSegmentData.currentTravelTime` | `int` | No | *(derived → delay_seconds)* | Giây, dùng tính `delay_seconds` |
| `flowSegmentData.freeFlowTravelTime` | `int` | No | *(derived → delay_seconds)* | Giây, dùng tính `delay_seconds` |
| `flowSegmentData.confidence` | `float` | No | `fact_traffic_flow.quality_flag` | 0.0–1.0 → `round(confidence * 9)` → SMALLINT 0–9 |
| `flowSegmentData.roadClosure` | `bool` | No | `fact_traffic_flow.is_closed` | Trực tiếp map |
| `flowSegmentData.coordinates.coordinate[]` | `list[dict]` | No | *(map-matching → segment_key)* | Dùng `geo_ops.find_nearest_segment()` |

### 1.3 Pydantic Schema (`src/schemas/tomtom_schema.py`)

```python
class TomTomCoordinate(BaseModel):
    latitude: float
    longitude: float

class TomTomCoordinates(BaseModel):
    coordinate: list[TomTomCoordinate]

class TomTomFlowSegment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    frc: str
    current_speed: float          = Field(alias="currentSpeed")
    free_flow_speed: float        = Field(alias="freeFlowSpeed")
    current_travel_time: int      = Field(alias="currentTravelTime")
    free_flow_travel_time: int    = Field(alias="freeFlowTravelTime")
    confidence: float             = Field(ge=0.0, le=1.0)
    road_closure: bool            = Field(alias="roadClosure")
    coordinates: TomTomCoordinates

class TomTomFlowResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    flow_segment_data: TomTomFlowSegment = Field(alias="flowSegmentData")
```

### 1.4 Alias Mapping (camelCase → snake_case)

| API JSON Key | Pydantic Field | Python usage |
|:-------------|:---------------|:-------------|
| `currentSpeed` | `current_speed` | `seg.current_speed` |
| `freeFlowSpeed` | `free_flow_speed` | `seg.free_flow_speed` |
| `currentTravelTime` | `current_travel_time` | `seg.current_travel_time` |
| `freeFlowTravelTime` | `free_flow_travel_time` | `seg.free_flow_travel_time` |
| `roadClosure` | `road_closure` | `seg.road_closure` |
| `flowSegmentData` | `flow_segment_data` | `resp.flow_segment_data` |

### 1.5 Derived Fields (tính trong Transformer)

| Derived Field | Công thức | DW Column | Tham chiếu |
|:-------------|:----------|:----------|:-----------|
| `delay_seconds` | `current_travel_time - free_flow_travel_time` (min 0) | `fact_traffic_flow.delay_seconds` | `spec_4 §1.4` |
| `traffic_index` | `clamp(1.0 - current_speed / free_flow_speed, 0.0, 1.0)` | `fact_traffic_flow.traffic_index` | `spec_4 §1.1` |
| `los_level` | `calculate_los_level(traffic_index)` → `'A'`–`'F'` | `fact_traffic_flow.los_level` | `spec_4 §1.2` |
| `congestion_level` | `calculate_congestion_level(los_level)` → `0`–`5` | `fact_traffic_flow.congestion_level` | `spec_4 §1.3` |
| `quality_flag` | `round(confidence * 9)` → SMALLINT 0–9 | `fact_traffic_flow.quality_flag` | `spec_4 §1.5` |
| `pcu_volume` | BPR inverse estimation (xem `spec_4 §2`) | `fact_traffic_flow.pcu_volume` | `spec_4 §2` |
| `traffic_flow_key` | `int(sha256(f"{segment_key}_{date_key}_{time_key}").hexdigest()[:15], 16)` | `fact_traffic_flow.traffic_flow_key` (PK) | `spec_4 §1.6` |
| `date_key` | `int(timestamp.astimezone(tz_hcm).strftime("%Y%m%d"))` | `fact_traffic_flow.date_key` | `spec_4 §1.7` |
| `time_key` | `timestamp.hour * 60 + timestamp.minute` (sau convert TZ) | `fact_traffic_flow.time_key` | `spec_4 §1.7` |

### 1.6 Transform Rules (tóm tắt – chi tiết xem spec_4)

```python
# Trong TrafficTransformer.transform():
from src.utils.math_calc import (
    calculate_traffic_index, calculate_los_level,
    calculate_congestion_level, calculate_delay_seconds,
    estimate_pcu_from_speed, generate_traffic_flow_key,
)

seg = response.flow_segment_data
tz_hcm = ZoneInfo("Asia/Ho_Chi_Minh")
ts_local = datetime.now(tz=tz_hcm)

delay       = calculate_delay_seconds(seg.current_travel_time, seg.free_flow_travel_time)
traffic_idx = calculate_traffic_index(seg.current_speed, seg.free_flow_speed)
los         = calculate_los_level(traffic_idx)
congestion  = calculate_congestion_level(los)
quality     = round(seg.confidence * 9)
date_key    = int(ts_local.strftime("%Y%m%d"))
time_key    = ts_local.hour * 60 + ts_local.minute
flow_key    = generate_traffic_flow_key(segment_key, date_key, time_key)
pcu         = estimate_pcu_from_speed(seg.current_speed, seg.free_flow_speed, lane_count)
```

---

## 2. TomTom Incident Details API v5

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `GET https://api.tomtom.com/traffic/services/5/incidentDetails` |
| **Tham số** | `key`, `bbox=106.663,10.743,106.723,10.803`, `fields={all}`, `language=vi` |
| **Tần suất gọi** | Mỗi 15 phút (chung cron với Traffic Flow) |
| **Pipeline file** | `src/pipelines/real_time/incident_pipeline.py` |
| **Schema file** | `src/schemas/tomtom_schema.py` → `TomTomIncidentFeature`, `TomTomIncidentProperties` |
| **Load vào** | `fact_incident` |

### 2.1 Raw JSON Response

```json
{
    "incidents": [
        {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [106.6623088547, 10.755603188],
                    [106.6633616217, 10.7558070779]
                ]
            },
            "properties": {
                "id": "incident-unique-id",
                "iconCategory": 6,
                "magnitudeOfDelay": 2,
                "startTime": "2026-02-20T07:30:00+07:00",
                "endTime": "2026-02-20T09:00:00+07:00",
                "from": "Nguyễn Huệ",
                "to": "Lê Lợi",
                "length": 245,
                "delay": 180,
                "roadNumbers": ["QL1A"],
                "events": [
                    { "code": 401, "description": "construction" }
                ]
            }
        }
    ]
}
```

### 2.2 Field Contract

| JSON Path | Python Type | Nullable | DW Column | Ghi chú |
|:----------|:-----------|:--------:|:----------|:--------|
| `properties.id` | `str` | No | `fact_incident.incident_key` | `hash(id) → BIGINT` |
| `properties.iconCategory` | `int` | No | `fact_incident.incident_type` | Map qua `ICON_CATEGORY_MAP` (xem §2.4) |
| `properties.magnitudeOfDelay` | `int` | **Yes** | `fact_incident.severity_level` | null → `0`, trực tiếp map 0–4 |
| `properties.startTime` | `str` (ISO 8601) | No | `fact_incident.timestamp`, `date_key`, `time_key` | Parse → datetime → derive keys |
| `properties.endTime` | `str` (ISO 8601) | **Yes** | *(derived → is_active)* | `endTime > now()` → `is_active=True` |
| `properties.delay` | `int` | **Yes** | `fact_incident.delay_seconds` | Giây, null → `0` |
| `properties.length` | `float` | **Yes** | *(metadata, không lưu DB)* | Mét – chiều dài đoạn ảnh hưởng |
| `properties.from` | `str` | **Yes** | *(metadata, không lưu DB)* | Tên đường bắt đầu |
| `properties.to` | `str` | **Yes** | *(metadata, không lưu DB)* | Tên đường kết thúc |
| `geometry.type` | `str` | No | – | Luôn `"LineString"` |
| `geometry.coordinates` | `list[list[float]]` | No | `fact_incident.geometry` | `[lon, lat]` → centroid → `POINT` |

### 2.3 Pydantic Schema (`src/schemas/tomtom_schema.py`)

```python
class TomTomIncidentGeometry(BaseModel):
    type: str
    coordinates: list[list[float]]   # [[lon, lat], ...]

class TomTomIncidentProperties(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    icon_category: int              = Field(alias="iconCategory")
    magnitude_of_delay: int | None  = Field(default=0, alias="magnitudeOfDelay")
    start_time: str                 = Field(alias="startTime")
    end_time: str | None            = Field(default=None, alias="endTime")
    delay: int | None               = Field(default=0)
    length: float | None            = None
    from_road: str | None           = Field(default=None, alias="from")
    to_road: str | None             = Field(default=None, alias="to")
    events: list[dict] | None       = None

class TomTomIncidentFeature(BaseModel):
    type: str                       # "Feature"
    geometry: TomTomIncidentGeometry
    properties: TomTomIncidentProperties

class TomTomIncidentResponse(BaseModel):
    incidents: list[TomTomIncidentFeature]
```

### 2.4 iconCategory → incident_type Mapping

```python
# Đặt trong src/utils/weather_mapping.py (hoặc incident_mapping section)
ICON_CATEGORY_MAP: dict[int, str] = {
    1:  "accident",
    2:  "fog",
    3:  "dangerous_conditions",
    4:  "rain",
    5:  "ice",
    6:  "jam",
    7:  "lane_closed",
    8:  "road_closed",
    9:  "road_works",
    10: "wind",
    11: "flooding",
    14: "broken_down_vehicle",
}
# Fallback: nếu iconCategory không có trong map → "unknown"
```

### 2.5 Derived Fields

| Derived Field | Công thức | DW Column |
|:-------------|:----------|:----------|
| `incident_key` | `int(hashlib.sha256(properties.id.encode()).hexdigest()[:15], 16)` | `fact_incident.incident_key` (PK) |
| `incident_type` | `ICON_CATEGORY_MAP.get(icon_category, "unknown")` | `fact_incident.incident_type` |
| `severity_level` | `magnitude_of_delay if magnitude_of_delay is not None else 0` | `fact_incident.severity_level` |
| `delay_seconds` | `delay if delay is not None else 0` | `fact_incident.delay_seconds` |
| `is_active` | `parse(endTime) > datetime.now(tz_hcm) if endTime else True` | `fact_incident.is_active` |
| `geometry` | centroid of LineString: `"POINT({avg_lon} {avg_lat})"` | `fact_incident.geometry` |
| `date_key` | `int(parse(startTime).astimezone(tz_hcm).strftime("%Y%m%d"))` | `fact_incident.date_key` |
| `time_key` | `start_dt.hour * 60 + start_dt.minute` | `fact_incident.time_key` |
| `segment_key` | `find_nearest_segment(centroid_lat, centroid_lon, segments_gdf)` | `fact_incident.segment_key` |

---

## 3. TomTom Routing API

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `GET https://api.tomtom.com/routing/1/calculateRoute/{locations}/json` |
| **Mục đích** | Validation CityFlow simulation, KHÔNG thuộc ETL chính |
| **Pipeline** | Không có pipeline riêng – dùng trong `ai-core` hoặc adhoc |
| **Load vào** | Không load trực tiếp vào DW |

### 3.1 Raw JSON Response

```json
{
    "formatVersion": "0.0.12",
    "routes": [
        {
            "summary": {
                "lengthInMeters": 1001,
                "travelTimeInSeconds": 357,
                "trafficDelayInSeconds": 0,
                "departureTime": "2026-02-19T11:10:54+07:00",
                "arrivalTime": "2026-02-19T11:16:51+07:00"
            },
            "legs": [
                {
                    "summary": { "lengthInMeters": 1001, "travelTimeInSeconds": 357 },
                    "points": [
                        { "latitude": 10.77959, "longitude": 106.69889 },
                        { "latitude": 10.77666, "longitude": 106.69498 }
                    ]
                }
            ]
        }
    ]
}
```

### 3.2 Field Contract (tham khảo, không bắt buộc implement)

| JSON Path | Type | Ghi chú |
|:----------|:-----|:--------|
| `routes[0].summary.travelTimeInSeconds` | `int` | So sánh vs CityFlow sim travel time |
| `routes[0].summary.trafficDelayInSeconds` | `int` | Delay thực tế từ TomTom |
| `routes[0].summary.lengthInMeters` | `int` | Chiều dài tuyến (mét) |

> **Lưu ý:** Section này **không yêu cầu** Pydantic schema hoặc Transformer. Chỉ để Agent biết cấu trúc khi cần validate.

---

## 4. TomTom Snap-to-Roads API

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `POST https://api.tomtom.com/snap-to-roads/1/snap-to-roads` |
| **Mục đích** | Chuẩn hóa tọa độ GPS trước khi nạp `dim_node` |
| **Pipeline file** | `src/pipelines/spatial_net/osm_pipeline.py` (optional step) |
| **Load vào** | Chuẩn hóa tọa độ → cập nhật `dim_node.is_snapped = True` |

### 4.1 Raw JSON Response

```json
{
    "route": [
        {
            "geometry": {
                "coordinates": [
                    [106.6991744936, 10.7781095803],
                    [106.6993635893, 10.7783187926]
                ]
            }
        }
    ]
}
```

### 4.2 Field Contract

| JSON Path | Python Type | DW Column | Ghi chú |
|:----------|:-----------|:----------|:--------|
| `route[].geometry.coordinates[]` | `list[float, float]` | `dim_node.geometry` | `[lon, lat]` – **GeoJSON = [lon, lat]**, KHÔNG phải [lat, lon] |

> **Quan trọng:** Khi convert GeoJSON → WKT PostGIS: `POINT(lon lat)` – thứ tự trùng khớp.

---

## 5. OpenWeatherMap – Current Weather 2.5

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `GET https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={key}&units=metric&lang=vi` |
| **Tần suất gọi** | Mỗi 15 phút (cùng cron real-time) |
| **Pipeline file** | `src/pipelines/real_time/weather_pipeline.py` |
| **Schema file** | `src/schemas/weather_schema.py` → `WeatherResponse` |
| **Load vào** | `dim_weather` + trả về `weather_key` cho `traffic_pipeline` |

### 5.1 Raw JSON Response

```json
{
    "coord": { "lon": 106.7011, "lat": 10.7764 },
    "weather": [
        {
            "id": 500,
            "main": "Rain",
            "description": "mưa nhẹ",
            "icon": "10d"
        }
    ],
    "main": {
        "temp": 34.43,
        "feels_like": 41.26,
        "temp_min": 34.43,
        "temp_max": 34.95,
        "pressure": 1007,
        "humidity": 55
    },
    "visibility": 10000,
    "wind": { "speed": 3.6, "deg": 0, "gust": 8.75 },
    "rain": { "1h": 0.16 },
    "clouds": { "all": 20 },
    "dt": 1771401818,
    "sys": { "country": "VN", "sunrise": 1771369976, "sunset": 1771412501 },
    "timezone": 25200,
    "id": 1566083,
    "name": "Thành phố Hồ Chí Minh",
    "cod": 200
}
```

### 5.2 Field Contract

| JSON Path | Python Type | Nullable | DW Column | Ghi chú |
|:----------|:-----------|:--------:|:----------|:--------|
| `weather[0].id` | `int` | No | `dim_weather.weather_key` (PK) + `dim_weather.weather_id` | 200–804, mã điều kiện OWM |
| `weather[0].main` | `str` | No | `dim_weather.main_category` | "Rain", "Clear", "Clouds", "Thunderstorm", ... |
| `weather[0].description` | `str` | Yes | *(log only, không lưu DB)* | Mô tả tiếng Việt |
| `weather[0].icon` | `str` | Yes | *(không lưu DB)* | Icon code |
| `main.temp` | `float` | No | *(enrichment – không có cột DB)* | °C (metric) |
| `main.humidity` | `int` | No | *(enrichment – không có cột DB)* | 0–100% |
| `visibility` | `int` | Yes | *(enrichment – không có cột DB)* | Mét – tầm nhìn |
| `wind.speed` | `float` | Yes | *(enrichment – không có cột DB)* | m/s |
| `rain.1h` | `float` | Yes | *(enrichment – không có cột DB)* | mm lượng mưa 1h |
| `dt` | `int` | No | `dim_weather.record_timestamp` | Unix epoch → `datetime.fromtimestamp(dt, tz=UTC)` |

### 5.3 Pydantic Schema (`src/schemas/weather_schema.py`)

```python
class WeatherCondition(BaseModel):
    id: int = Field(ge=200, le=900)
    main: str
    description: str | None = None
    icon: str | None = None

class WeatherMain(BaseModel):
    temp: float
    feels_like: float | None = None
    humidity: int

class WeatherWind(BaseModel):
    speed: float
    deg: int | None = None
    gust: float | None = None

class WeatherRain(BaseModel):
    one_hour: float | None = Field(default=None, alias="1h")

class WeatherResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    weather: list[WeatherCondition]   # Luôn có ít nhất 1 phần tử
    main: WeatherMain
    visibility: int | None = None
    wind: WeatherWind | None = None
    rain: WeatherRain | None = None
    dt: int
    timezone: int                     # Offset giây vs UTC (25200 = +7h)
    name: str | None = None
```

### 5.4 Derived Fields

| Derived Field | Công thức | DW Column |
|:-------------|:----------|:----------|
| `weather_key` | `weather[0].id` (trực tiếp dùng làm PK) | `dim_weather.weather_key` |
| `weather_id` | `weather[0].id` | `dim_weather.weather_id` |
| `main_category` | `weather[0].main` | `dim_weather.main_category` |
| `severity_level` | `get_weather_severity(weather[0].id)` → 0–5 | `dim_weather.severity_level` |
| `record_timestamp` | `datetime.fromtimestamp(dt, tz=UTC)` | `dim_weather.record_timestamp` |

### 5.5 Weather Severity Mapping (Chi tiết xem spec_4 §3)

```python
# Đặt trong src/utils/weather_mapping.py
WEATHER_SEVERITY_MAP: dict[range | int, int] = {
    range(200, 300): 4,   # Thunderstorm → Ảnh hưởng lớn
    range(300, 400): 2,   # Drizzle → Ảnh hưởng nhẹ
    range(500, 600): 3,   # Rain → Ảnh hưởng trung bình
    range(600, 700): 3,   # Snow → Trung bình (hiếm ở HCM)
    range(700, 800): 1,   # Atmosphere (mist, haze) → Nhẹ
    800:             0,   # Clear → Không ảnh hưởng
    range(801, 900): 0,   # Clouds → Không ảnh hưởng
}
# Default: 0 nếu weather_id không khớp range nào
```

---

## 6. OpenWeatherMap – Forecast 5d/3h

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `GET https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={key}&units=metric&lang=vi` |
| **Tần suất** | 1 lần/ngày (batch dự báo) |
| **Pipeline file** | `src/pipelines/real_time/weather_pipeline.py` (method riêng) |
| **Schema file** | `src/schemas/weather_schema.py` → `ForecastItem`, `ForecastResponse` |
| **Load vào** | *(cache/pre-compute cho ML, KHÔNG load trực tiếp vào dim_weather)* |

### 6.1 Raw JSON Response (1 item)

```json
{
    "cod": "200",
    "cnt": 40,
    "list": [
        {
            "dt": 1771405200,
            "main": { "temp": 34.43, "humidity": 58 },
            "weather": [{ "id": 801, "main": "Clouds", "description": "mây thưa" }],
            "wind": { "speed": 5.21, "deg": 149 },
            "visibility": 10000,
            "pop": 0,
            "dt_txt": "2026-02-18 09:00:00"
        }
    ],
    "city": {
        "id": 1566083,
        "name": "Thành phố Hồ Chí Minh",
        "coord": { "lat": 10.776, "lon": 106.7 },
        "timezone": 25200
    }
}
```

### 6.2 Pydantic Schema

```python
class ForecastItem(BaseModel):
    dt: int
    main: WeatherMain
    weather: list[WeatherCondition]
    wind: WeatherWind | None = None
    visibility: int | None = None
    pop: float | None = None          # Probability of precipitation 0.0–1.0
    dt_txt: str | None = None         # "YYYY-MM-DD HH:MM:SS" UTC

class ForecastCity(BaseModel):
    id: int
    name: str
    timezone: int

class ForecastResponse(BaseModel):
    cod: str
    cnt: int
    list: list[ForecastItem] = Field(alias="list")
    city: ForecastCity
```

### 6.3 Field Contract bổ sung

| JSON Path | Type | Ghi chú |
|:----------|:-----|:--------|
| `list[].pop` | `float` | 0.0–1.0, xác suất mưa – input cho ML model |
| `list[].dt_txt` | `str` | UTC timestamp text, dùng khi `dt` không đủ |
| `cnt` | `int` | Max 40 = 5 ngày × 8 lần/ngày (3h interval) |
| `city.timezone` | `int` | 25200 = +7h (Asia/Ho_Chi_Minh) |

---

## 7. OpenStreetMap – Nodes (via OSMnx)

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Method** | `osmnx.graph_from_place("District 1, Ho Chi Minh City", network_type="drive")` |
| **Tần suất** | 1 lần khi init hạ tầng, hoặc khi OSM cập nhật |
| **Pipeline file** | `src/pipelines/spatial_net/osm_pipeline.py` |
| **Schema file** | `src/schemas/osm_schema.py` → `OSMNode` |
| **Load vào** | `dim_node` |

### 7.1 Raw Data Structure (GeoDataFrame → dict)

```json
{
    "366440881": {
        "y": 10.7927,
        "x": 106.696,
        "street_count": 4,
        "highway": null,
        "ref": null,
        "geometry": "POINT (106.6958961 10.7926816)"
    }
}
```

> **Lưu ý:** Data đến từ `osmnx` (GeoDataFrame), KHÔNG phải JSON API. Schema dùng validate **sau khi** convert `nodes_gdf.to_dict(orient="index")`.

### 7.2 Field Contract

| Field | Python Type | Nullable | DW Column | Ghi chú |
|:------|:-----------|:--------:|:----------|:--------|
| *key* (osmid) | `int` | No | `dim_node.node_key` + `dim_node.node_source_id` | OSM Node ID, dùng trực tiếp làm PK BIGINT |
| `y` | `float` | No | `dim_node.geometry` (lat) | Latitude WGS84 |
| `x` | `float` | No | `dim_node.geometry` (lon) | Longitude WGS84 |
| `street_count` | `int` | No | *(derived → node_type)* | Số đường giao tại node |
| `highway` | `str \| None` | **Yes** | *(derived → node_type)* | `"traffic_signals"` hoặc null |

### 7.3 Pydantic Schema (`src/schemas/osm_schema.py`)

```python
class OSMNode(BaseModel):
    osmid: int
    x: float             # longitude
    y: float             # latitude
    street_count: int = 0
    highway: str | None = None
```

### 7.4 node_type Derivation Logic (Chi tiết xem spec_4 §4.1)

```python
def derive_node_type(highway: str | None, street_count: int) -> str:
    """Rule-based node classification."""
    if highway == "traffic_signals":
        return "signalized"
    elif street_count >= 3:
        return "intersection"
    elif street_count == 1:
        return "terminal"
    else:
        return "intermediate"
```

### 7.5 Geometry Output

```python
# PostGIS WKT format:
geometry = f"SRID=4326;POINT({x} {y})"
# Ví dụ: "SRID=4326;POINT(106.6958961 10.7926816)"
# Loader sử dụng: func.ST_GeomFromText(wkt, 4326)
```

---

## 8. OpenStreetMap – Edges (via OSMnx)

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Method** | `ox.graph_to_gdfs(G, nodes=False, edges=True)` |
| **Tần suất** | 1 lần khi init |
| **Pipeline file** | `src/pipelines/spatial_net/osm_pipeline.py` |
| **Schema file** | `src/schemas/osm_schema.py` → `OSMEdge` |
| **Load vào** | `dim_segment`, `dim_way`, `dim_road` |

### 8.1 Raw Data Structure (GeoDataFrame → dict)

```json
{
    "edge_key": "(366440881, 411925963, 0)",
    "osmid": 817909615,
    "oneway": true,
    "highway": "primary",
    "reversed": false,
    "length": 94.116,
    "name": "Đinh Tiên Hoàng",
    "geometry": "LINESTRING (106.6958961 10.7926816, 106.6958881 10.7925668, ...)",
    "lanes": null,
    "maxspeed": null,
    "width": null,
    "bridge": null,
    "junction": null
}
```

### 8.2 Field Contract

| Field | Python Type | Nullable | DW Column | Ghi chú |
|:------|:-----------|:--------:|:----------|:--------|
| `edge_key[0]` (u) | `int` | No | `dim_segment.from_node_key` | OSM node ID đầu (FK → dim_node) |
| `edge_key[1]` (v) | `int` | No | `dim_segment.to_node_key` | OSM node ID cuối (FK → dim_node) |
| `osmid` | `int` | No | `dim_segment.segment_id_source` | OSM Way ID |
| `name` | `str \| None` | **Yes** | `dim_road.name` | **Fallback: `"N/A"`** khi null |
| `highway` | `str` | No | `dim_way.osm_highway_type` | `primary`, `secondary`, `residential`, ... |
| `length` | `float` | No | `dim_segment.length_m` | Mét (tính bởi OSMnx, DECIMAL(10,2)) |
| `oneway` | `bool` | No | `dim_segment.is_one_way` | Trực tiếp |
| `lanes` | `str \| int \| list \| None` | **Yes** | `dim_way.default_lane_count` | Phức tạp – xem Fallback §8.5 |
| `maxspeed` | `str \| int \| None` | **Yes** | `dim_way.default_speed_limit` | Rất thiếu (30%) – xem Fallback §8.5 |
| `geometry` | `LineString` | No | `dim_segment.geometry_linestring` | WKT EPSG:4326 |

### 8.3 Pydantic Schema (`src/schemas/osm_schema.py`)

```python
class OSMEdge(BaseModel):
    from_node: int       # u (edge_key[0])
    to_node: int         # v (edge_key[1])
    osmid: int
    name: str | None = None
    highway: str
    length: float
    oneway: bool = False
    lanes: str | int | list | None = None
    maxspeed: str | int | None = None
    geometry_wkt: str    # WKT LineString
```

### 8.4 Coverage & Fallback Mặc định (Dựa trên OSM Coverage Report)

| Trường | Độ phủ thực tế | Fallback Rule | Xem chi tiết |
|:-------|:--------------:|:-------------|:-------------|
| `osmid` | 100% | – | – |
| `oneway` | 100% | – | – |
| `highway` | 100% | – | – |
| `length` | 100% | – | – |
| `name` | **84.5%** | `"N/A"` | `spec_4 §4.3` |
| `lanes` | **58.5%** | Mặc định theo `highway` type | `spec_4 §4.4` |
| `maxspeed` | **30.0%** | Mặc định theo `highway` type | `spec_4 §4.5` |
| `width` | 0.6% | **Bỏ qua, KHÔNG sử dụng** | – |

### 8.5 Fallback Defaults theo highway type

```python
# Đặt trong src/utils/geo_ops.py hoặc constants section

DEFAULT_LANE_COUNT: dict[str, int] = {
    "trunk": 4,
    "trunk_link": 3,
    "primary": 3,
    "primary_link": 2,
    "secondary": 2,
    "secondary_link": 2,
    "tertiary": 2,
    "tertiary_link": 2,
    "residential": 2,
    "living_street": 1,
}

DEFAULT_SPEED_LIMIT: dict[str, int] = {
    "trunk": 60,
    "trunk_link": 50,
    "primary": 50,
    "primary_link": 40,
    "secondary": 40,
    "secondary_link": 40,
    "tertiary": 40,
    "tertiary_link": 30,
    "residential": 30,
    "living_street": 20,
}
```

#### Hàm parse_lanes (xử lý dạng list)

```python
def parse_lanes(raw_lanes: str | int | list | None, highway: str) -> int:
    """
    OSM lanes có thể là: None, "3", 3, ["3", "2"], "3;2"
    → Parse lấy giá trị max, fallback theo highway type.
    """
    if raw_lanes is None:
        return DEFAULT_LANE_COUNT.get(highway, 2)
    if isinstance(raw_lanes, int):
        return raw_lanes
    if isinstance(raw_lanes, list):
        return max(int(x) for x in raw_lanes)
    if isinstance(raw_lanes, str):
        if ";" in raw_lanes:
            return max(int(x) for x in raw_lanes.split(";"))
        return int(raw_lanes)
    return DEFAULT_LANE_COUNT.get(highway, 2)
```

#### Hàm parse_maxspeed

```python
def parse_maxspeed(raw_speed: str | int | None, highway: str) -> int:
    """
    OSM maxspeed có thể là: None, "50", 50, "50 km/h"
    → Parse lấy số, fallback theo highway type.
    """
    if raw_speed is None:
        return DEFAULT_SPEED_LIMIT.get(highway, 30)
    if isinstance(raw_speed, int):
        return raw_speed
    if isinstance(raw_speed, str):
        digits = "".join(c for c in raw_speed if c.isdigit())
        return int(digits) if digits else DEFAULT_SPEED_LIMIT.get(highway, 30)
    return DEFAULT_SPEED_LIMIT.get(highway, 30)
```

### 8.6 highway → FRC Mapping (OSM → TomTom Functional Road Class)

```python
FRC_MAP: dict[str, int] = {
    "trunk":           0,   # FRC0 – Motorway
    "trunk_link":      0,
    "primary":         2,   # FRC2 – Major road
    "primary_link":    3,
    "secondary":       4,   # FRC4 – Secondary road
    "secondary_link":  4,
    "tertiary":        5,   # FRC5 – Local connecting
    "tertiary_link":   5,
    "residential":     6,   # FRC6 – Local road
    "living_street":   6,
}
# Fallback: highway type không có trong map → FRC 6 (local road)
```

### 8.7 Derived Fields cho dim_way

| Derived Field | Công thức | DW Column |
|:-------------|:----------|:----------|
| `way_key` | `osmid` (OSM Way ID) | `dim_way.way_key` |
| `road_key` | Group by `name` → unique id | `dim_way.road_key` (FK) |
| `default_lane_count` | `parse_lanes(lanes, highway)` | `dim_way.default_lane_count` |
| `default_speed_limit` | `parse_maxspeed(maxspeed, highway)` | `dim_way.default_speed_limit` |
| `design_capacity` | `default_lane_count * 2000` | `dim_way.design_capacity` |
| `osm_highway_type` | `highway` trực tiếp | `dim_way.osm_highway_type` |
| `tomtom_frc` | `FRC_MAP.get(highway, 6)` | `dim_way.tomtom_frc` |

### 8.8 Derived Fields cho dim_segment

| Derived Field | Công thức | DW Column |
|:-------------|:----------|:----------|
| `segment_key` | `int(sha256(f"{from_node}_{to_node}_{osmid}").hexdigest()[:15], 16)` | `dim_segment.segment_key` (PK) |
| `geometry_center` | `ST_Centroid(geometry_linestring)` | `dim_segment.geometry_center` |
| `geometry_linestring` | LineString WKT trực tiếp từ OSMnx | `dim_segment.geometry_linestring` |

### 8.9 Derived Fields cho dim_road

| Derived Field | Công thức | DW Column |
|:-------------|:----------|:----------|
| `road_key` | `int(sha256(name.encode()).hexdigest()[:15], 16)` | `dim_road.road_key` (PK) |
| `name` | `name if name else "N/A"` | `dim_road.name` |
| `total_length_m` | `SUM(length)` group by road_name | `dim_road.total_length_m` |

---

## 9. OpenStreetMap – Traffic Signals (via Overpass)

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Method** | Overpass API query `node["highway"="traffic_signals"]` trong bbox Quận 1 |
| **Tần suất** | 1 lần khi init |
| **Pipeline file** | `src/pipelines/spatial_net/osm_pipeline.py` (step 2) |
| **Schema file** | `src/schemas/osm_schema.py` → `TrafficSignalNode` |
| **Load vào** | UPDATE `dim_node.node_type = 'signalized'` (JOIN trên `node_source_id`) |

### 9.1 Raw Data Structure

```json
[
    {
        "osmid": 411918181,
        "lat": 10.771612,
        "lon": 106.692990,
        "highway": "traffic_signals",
        "crossing": null
    }
]
```

### 9.2 Field Contract

| Field | Type | Nullable | DW Column | Ghi chú |
|:------|:-----|:--------:|:----------|:--------|
| `osmid` | `int` | No | `dim_node.node_source_id` | JOIN key → UPDATE existing node |
| `lat` | `float` | No | – | Xác nhận vị trí |
| `lon` | `float` | No | – | Xác nhận vị trí |
| `highway` | `str` | No | – | Luôn = `"traffic_signals"` |
| `crossing` | `str \| None` | **Yes** | *(metadata)* | `"traffic_signals"` hoặc null |

### 9.3 Pydantic Schema

```python
class TrafficSignalNode(BaseModel):
    osmid: int
    lat: float
    lon: float
    highway: str = "traffic_signals"
    crossing: str | None = None
```

### 9.4 Transform Rules

```python
# Step 1: Gom nhóm đèn gần nhau < 10m bằng DBSCAN (optional)
# Step 2: UPDATE dim_node SET node_type = 'signalized'
#          WHERE node_source_id IN (list_of_signal_osmids)
# Thống kê: 219 đèn tín hiệu tại Quận 1 (theo report)
```

---

## 10. SerpApi – Google Events

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `GET https://serpapi.com/search?engine=google_events&q=Events+in+HoChiMinh+City+District+1` |
| **Tần suất** | 1 lần/ngày (batch) |
| **Pipeline** | *(Phase 2 – không bắt buộc MVP)* |
| **Load vào** | `fact_event` |

### 10.1 Raw JSON Response

```json
[
    {
        "title": "Mekong Discovery",
        "date": { "start_date": "Feb 19", "when": "Feb 19 – 26" },
        "address": ["Avalon Apartments, 53 Nguyễn Thị Minh Khai, Bến Nghé, Quận 3"],
        "description": "Cruise event...",
        "venue": { "name": "Avalon Apartments", "rating": 4.2, "reviews": 40 }
    }
]
```

### 10.2 Field Contract

| JSON Path | Type | Nullable | DW Column | Ghi chú |
|:----------|:-----|:--------:|:----------|:--------|
| `title` | `str` | No | `fact_event.event_title` | VARCHAR(255) |
| `date.start_date` | `str` | No | `fact_event.date_key` | Parse "Feb 19" → YYYYMMDD |
| `date.when` | `str` | No | *(derived)* | Tính `start_time_key`, `end_time_key` |
| `address[0]` | `str` | Yes | *(geocode → location_key)* | Geocode → `dim_location` FK |
| `venue.name` | `str` | Yes | *(metadata)* | Tên địa điểm |
| `description` | `str` | Yes | *(metadata)* | Mô tả sự kiện |

### 10.3 Transform Rules (Phase 2)

```python
# event_type: inference từ title + description (NLP hoặc keyword matching)
# attendance_scale: ước lượng từ venue.reviews
# impact_radius_m: mặc định 500m cho event nội thành
```

---

## 11. SerpApi – Google Local (POI)

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `GET https://serpapi.com/search?engine=google_local&q={query}` |
| **Pipeline** | *(Phase 2)* |
| **Dùng cho** | Enrichment `dim_location`, phân tích demand |

### 11.1 Raw JSON Response

```json
{
    "position": 1,
    "rating": 4.3,
    "reviews": 5400,
    "title": "Diamond Plaza",
    "type": "Trung tâm mua sắm",
    "gps_coordinates": { "latitude": 10.780562, "longitude": 106.698456 },
    "address": "34 Lê Duẩn"
}
```

### 11.2 Field Contract

| JSON Path | Type | Nullable | Ứng dụng |
|:----------|:-----|:--------:|:---------|
| `gps_coordinates.latitude` | `float` | No | Spatial join → nearest segment |
| `gps_coordinates.longitude` | `float` | No | Spatial join → nearest segment |
| `title` | `str` | No | Tên địa điểm |
| `type` | `str` | No | Phân loại POI |
| `reviews` | `int` | Yes | Proxy cho demand/sức hút |

---

## 12. SerpApi – Google News

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Endpoint** | `GET https://serpapi.com/search?engine=google_news&q=kẹt+xe+quận+1+TPHCM` |
| **Pipeline** | *(Phase 2)* |
| **Dùng cho** | Early warning, enrichment `fact_incident` |

### 12.1 Raw JSON Response

```json
[
    {
        "title": "Cảnh sát giao thông TP.HCM hướng dẫn lộ trình thay thế",
        "source": { "name": "Báo Tuổi Trẻ" },
        "link": "https://tuoitre.vn/...",
        "iso_date": "2026-02-12T01:30:00Z"
    }
]
```

### 12.2 Field Contract

| JSON Path | Type | Ứng dụng |
|:----------|:-----|:---------|
| `title` | `str` | NLP → extract keyword (kẹt xe, ngập, tai nạn) |
| `source.name` | `str` | Độ tin cậy nguồn |
| `link` | `str` | URL bài báo |
| `iso_date` | `str` | ISO 8601 → timestamp |

---

## 13. Mapping tổng hợp: API Field → DW Column

### 13.1 `fact_traffic_flow` ← TomTom Flow + OpenWeather + Derived

| DW Column | DB Type | Source API | Source Field / Formula | Ghi chú |
|:----------|:--------|:----------|:----------------------|:--------|
| `traffic_flow_key` | `BIGINT` (PK) | *(generated)* | `int(sha256(f"{segment_key}_{date_key}_{time_key}").hexdigest()[:15], 16)` | Deterministic hash |
| `segment_key` | `BIGINT` (FK) | TomTom Flow | `coordinates` → `find_nearest_segment()` | Map-matching |
| `time_key` | `INT` (FK) | *(derived)* | `ts_local.hour * 60 + ts_local.minute` | 0–1439, `Asia/Ho_Chi_Minh` |
| `date_key` | `INT` (FK+PK) | *(derived)* | `int(ts_local.strftime("%Y%m%d"))` | YYYYMMDD, partition key |
| `weather_key` | `INT` (FK) | OpenWeather | `weather[0].id` | Từ weather_pipeline.run() |
| `timestamp` | `TIMESTAMP` | *(system)* | `datetime.now(tz=tz_hcm)` | Thời điểm ghi nhận |
| `pcu_volume` | `DECIMAL(10,2)` | *(derived)* | BPR inverse estimation | `spec_4 §2` |
| `current_speed_kmh` | `DECIMAL(5,2)` | TomTom | `currentSpeed` | Trực tiếp |
| `free_flow_speed_kmh` | `DECIMAL(5,2)` | TomTom | `freeFlowSpeed` | Trực tiếp |
| `traffic_index` | `DECIMAL(3,2)` | *(derived)* | `clamp(1.0 - cs/ffs, 0.0, 1.0)` | 0.00–1.00 |
| `delay_seconds` | `INT` | *(derived)* | `max(0, currentTT - freeflowTT)` | Giây |
| `los_level` | `CHAR(1)` | *(derived)* | `calculate_los_level(traffic_index)` | A–F |
| `congestion_level` | `SMALLINT` | *(derived)* | `calculate_congestion_level(los)` | 0–5 |
| `is_closed` | `BOOLEAN` | TomTom | `roadClosure` | Trực tiếp |
| `inserted_at` | `TIMESTAMP` | *(system)* | `datetime.utcnow()` | Bắt buộc |
| `quality_flag` | `SMALLINT` | *(derived)* | `round(confidence * 9)` | 0–9 |

### 13.2 `fact_incident` ← TomTom Incident v5

| DW Column | DB Type | Source Field | Formula / Transform |
|:----------|:--------|:-------------|:-------------------|
| `incident_key` | `BIGINT` (PK) | `properties.id` | `int(sha256(id.encode()).hexdigest()[:15], 16)` |
| `time_key` | `INT` (FK) | `properties.startTime` | `hour * 60 + minute` |
| `date_key` | `INT` (FK+PK) | `properties.startTime` | `YYYYMMDD` |
| `segment_key` | `BIGINT` (FK) | `geometry.coordinates` | centroid → `find_nearest_segment()` |
| `location_key` | `BIGINT` (FK) | *(spatial join)* | Reverse geocode centroid → `dim_location` |
| `incident_type` | `VARCHAR(50)` | `properties.iconCategory` | `ICON_CATEGORY_MAP[iconCat]` |
| `timestamp` | `TIMESTAMP` | `properties.startTime` | `dateutil.parser.parse()` |
| `severity_level` | `SMALLINT` | `properties.magnitudeOfDelay` | Trực tiếp (null → 0) |
| `delay_seconds` | `INT` | `properties.delay` | Trực tiếp (null → 0) |
| `geometry` | `GEOMETRY(Point,4326)` | `geometry.coordinates` | Centroid of LineString → `POINT(lon lat)` |
| `is_simulated` | `BOOLEAN` | *(hardcode)* | `False` (real data) |
| `is_active` | `BOOLEAN` | `properties.endTime` | `endTime > now()` |
| `inserted_at` | `TIMESTAMP` | *(system)* | `datetime.utcnow()` |
| `quality_flag` | `SMALLINT` | *(hardcode)* | `5` (medium confidence) |

### 13.3 `dim_weather` ← OpenWeather

| DW Column | DB Type | Source Field | Formula |
|:----------|:--------|:-------------|:--------|
| `weather_key` | `INT` (PK) | `weather[0].id` | Trực tiếp |
| `weather_id` | `INT` | `weather[0].id` | Trực tiếp |
| `main_category` | `VARCHAR(50)` | `weather[0].main` | Trực tiếp |
| `severity_level` | `SMALLINT` | *(derived)* | `get_weather_severity(id)` → 0–5 |
| `record_timestamp` | `TIMESTAMP` | `dt` | `datetime.fromtimestamp(dt, UTC)` |

### 13.4 `dim_node` ← OSM Nodes + Traffic Signals

| DW Column | DB Type | Source Field | Formula |
|:----------|:--------|:-------------|:--------|
| `node_key` | `BIGINT` (PK) | OSM `osmid` | Trực tiếp |
| `node_source_id` | `BIGINT` | OSM `osmid` | Trực tiếp |
| `node_type` | `VARCHAR(30)` | `highway` + `street_count` | `derive_node_type()` – xem §7.4 |
| `is_snapped` | `BOOLEAN` | *(default)* | `False` (True after Snap-to-Roads) |
| `geometry` | `GEOMETRY(Point,4326)` | `x`, `y` | `ST_GeomFromText('POINT(x y)', 4326)` |
| `record_timestamp` | `TIMESTAMP` | *(system)* | `CURRENT_TIMESTAMP` |

### 13.5 `dim_segment` ← OSM Edges

| DW Column | DB Type | Source Field | Formula |
|:----------|:--------|:-------------|:--------|
| `segment_key` | `BIGINT` (PK) | *(generated)* | `hash(from_node, to_node, osmid)` |
| `from_node_key` | `BIGINT` (FK) | `edge_key[0]` | Trực tiếp (FK → dim_node) |
| `to_node_key` | `BIGINT` (FK) | `edge_key[1]` | Trực tiếp (FK → dim_node) |
| `way_key` | `BIGINT` (FK) | `osmid` | FK → dim_way |
| `location_key` | `BIGINT` (FK) | *(spatial join)* | Centroid → nearest `dim_location` |
| `segment_id_source` | `BIGINT` | `osmid` | OSM Way ID trực tiếp |
| `length_m` | `DECIMAL(10,2)` | `length` | Trực tiếp (mét) |
| `geometry_center` | `GEOMETRY(Point)` | *(derived)* | `ST_Centroid(linestring)` |
| `geometry_linestring` | `GEOMETRY(LineString)` | `geometry` | WKT → `ST_GeomFromText(wkt, 4326)` |
| `is_one_way` | `BOOLEAN` | `oneway` | Trực tiếp |
| `record_timestamp` | `TIMESTAMP` | *(system)* | `CURRENT_TIMESTAMP` |

### 13.6 `dim_way` ← OSM Edges (grouped)

| DW Column | DB Type | Source Field | Formula |
|:----------|:--------|:-------------|:--------|
| `way_key` | `BIGINT` (PK) | `osmid` | OSM Way ID |
| `road_key` | `BIGINT` (FK) | `name` | hash(name) → FK dim_road |
| `total_length_m` | `DECIMAL(10,2)` | *(aggregated)* | SUM(length) per way |
| `direction` | `VARCHAR(20)` | `oneway` | `"Forward"` / `"Both"` |
| `segment_count` | `INT` | *(count)* | COUNT edges per way |
| `default_lane_count` | `SMALLINT` | `lanes` | `parse_lanes()` |
| `design_capacity` | `INT` | *(derived)* | `default_lane_count * 2000` (PCU/h) |
| `default_speed_limit` | `SMALLINT` | `maxspeed` | `parse_maxspeed()` |
| `tomtom_frc` | `SMALLINT` | `highway` | `FRC_MAP[highway]` |
| `osm_highway_type` | `VARCHAR(30)` | `highway` | Trực tiếp |

### 13.7 `dim_road` ← OSM Edges (grouped by name)

| DW Column | DB Type | Source Field | Formula |
|:----------|:--------|:-------------|:--------|
| `road_key` | `BIGINT` (PK) | `name` | `hash(name)` |
| `name` | `VARCHAR(100)` | `name` | Trực tiếp (null → `"N/A"`) |
| `total_length_m` | `DECIMAL(10,2)` | *(aggregated)* | SUM(length) group by name |

---

## Phụ lục A: Tham số cố định cho TP.HCM

```python
# ══════════════════════════════════════════════════════════
# Constants – Đặt trong src/core/config.py hoặc riêng constants file
# ══════════════════════════════════════════════════════════

# Bounding Box – Quận 1
BBOX_DISTRICT_1 = {
    "min_lon": 106.663,
    "min_lat": 10.743,
    "max_lon": 106.723,
    "max_lat": 10.803,
}

# Tọa độ trung tâm – dùng cho OpenWeather
CENTER_HCM = {
    "lat": 10.7764,
    "lon": 106.7011,
}

# Coordinate Reference Systems
WGS84 = "EPSG:4326"           # Hệ tọa độ địa lý (lon/lat)
UTM_48N = "EPSG:32648"        # UTM Zone 48N cho TP.HCM (mét)

# Timezone
TZ_HCM = "Asia/Ho_Chi_Minh"   # UTC+7

# Default speed limits (km/h) theo highway type
DEFAULT_SPEED_LIMITS: dict[str, int] = {
    "trunk": 60, "trunk_link": 50,
    "primary": 50, "primary_link": 40,
    "secondary": 40, "secondary_link": 40,
    "tertiary": 40, "tertiary_link": 30,
    "residential": 30, "living_street": 20,
}

# Default lane count theo highway type
DEFAULT_LANE_COUNT: dict[str, int] = {
    "trunk": 4, "trunk_link": 3,
    "primary": 3, "primary_link": 2,
    "secondary": 2, "secondary_link": 2,
    "tertiary": 2, "tertiary_link": 2,
    "residential": 2, "living_street": 1,
}

# FRC Mapping (OSM highway → TomTom Functional Road Class)
FRC_MAP: dict[str, int] = {
    "trunk": 0, "trunk_link": 0,
    "primary": 2, "primary_link": 3,
    "secondary": 4, "secondary_link": 4,
    "tertiary": 5, "tertiary_link": 5,
    "residential": 6, "living_street": 6,
}

# BPR Parameters (Bureau of Public Roads)
BPR_ALPHA = 0.15
BPR_BETA = 4.0
LANE_CAPACITY_PCU_PER_HOUR = 2000   # PCU/h per lane
```

## Phụ lục B: API Rate Limits & Quotas

| API | Plan | Giới hạn | Chiến lược quản lý |
|:----|:-----|:---------|:-------------------|
| TomTom Traffic Flow | Free | 2,500 req/day | Cache 15p, batch segment queries, ưu tiên primary/secondary roads |
| TomTom Incident | Free | Chung quota TomTom | 1 request/bbox mỗi 15 phút |
| TomTom Routing | Free | Chung quota TomTom | Chỉ dùng khi validate CityFlow |
| TomTom Snap-to-Roads | Free | Chung quota TomTom | Batch POST, optional step |
| OpenWeather Current | Free 2.5 | 1,000 req/day | 1 call/15min = 96/day |
| OpenWeather Forecast | Free 2.5 | Chung quota OWM | 1 call/day |
| OSMnx / Overpass | Free | Không giới hạn cứng | Cache local, chạy 1 lần |
| SerpApi | Free | 100 req/month | Phase 2 only, batch daily |

---

> **Tham chiếu chéo:**
> - `spec_1_blueprint.md` → Vị trí file, luồng chạy, dependency
> - `spec_2_base_interface.md` → ABC interface, Pydantic rules, SQLAlchemy pattern
> - `spec_4_business_logic.md` → **Chi tiết tất cả công thức tính toán** (traffic_index, LOS, PCU, BPR, hash key, node_type, fallbacks)
> - `spec_5_target_mapping.md` → **Quy tắc UPSERT, PostGIS, batch insert, FK order**
> - DB Schema: `infrastructure/postgres/2_create_dims.sql`, `3_create_facts.sql`
