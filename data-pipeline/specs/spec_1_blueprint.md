# SPEC 1 – THIẾT KẾ KIẾN TRÚC TỔNG THỂ (MASTER BLUEPRINT)

## MODULE `data-pipeline/`

| Metadata | Giá trị |
|:---------|:--------|
| **Phiên bản** | 2.0 |
| **Ngày cập nhật** | 2026-02-28 |
| **Phạm vi** | Toàn bộ thư mục `data-pipeline/` trong monorepo `traffic-ioc` |
| **Specs liên quan** | `spec_2_base_interface.md`, `spec_3_data_contracts.md`, `spec_4_business_logic.md`, `spec_5_target_mapping.md` |
| **DB Schema tham chiếu** | `infrastructure/postgres/2_create_dims.sql`, `3_create_facts.sql`, `4_indexes.sql` |

---

## 0. MỤC ĐÍCH CỦA FILE NÀY

Đây là **"bản đồ tổng"** để AI Agent (hoặc developer) biết chính xác:

1. Phải tạo thư mục và file ở **đâu**.
2. Mỗi file có **trách nhiệm gì**, import gì, export gì.
3. Luồng dữ liệu chạy **như thế nào** từ API bên ngoài đến Database.
4. Các **ràng buộc không được vi phạm** khi sinh code.

> **QUY TẮC VÀNG:** Không tạo file nào ngoài danh sách dưới đây. Không import vòng (circular). Không đặt logic nghiệp vụ vào `core/` hoặc `utils/` gọi DB.

---

## 1. VỊ TRÍ TRONG MONOREPO

```
traffic-ioc/                          ← GỐC MONOREPO
├── .env.example                      ← Template biến môi trường chung
├── docker-compose.yml                ← Định nghĩa service: postgres, data-pipeline, ai-core, redis
├── infrastructure/
│   └── postgres/
│       ├── 1_init_extensions.sql     ← PostGIS, pgRouting, btree_gin
│       ├── 2_create_dims.sql         ← 12 bảng Dimension
│       ├── 3_create_facts.sql        ← 6 bảng Fact (có Partition)
│       └── 4_indexes.sql             ← BRIN, GiST, B-Tree indexes
├── ai-core/                          ← Module ML & CityFlow (KHÔNG CHẠM)
├── backend/                          ← Module NestJS API   (KHÔNG CHẠM)
├── frontend/                         ← Module React UI     (KHÔNG CHẠM)
│
└── data-pipeline/                    ← **MODULE NÀY** ─ Phạm vi duy nhất được sửa
    ├── .env                          ← Biến môi trường riêng (đã có sẵn)
    ├── Dockerfile                    ← Build image Python 3.9 + GDAL (đã có sẵn)
    ├── requirements.txt              ← Dependencies         (đã có sẵn, cần bổ sung)
    ├── specs/                        ← Thư mục spec         (KHÔNG CHẠM)
    │   ├── spec_1_blueprint.md       ← File này
    │   ├── spec_2_base_interface.md
    │   ├── spec_3_data_contracts.md
    │   ├── spec_4_business_logic.md
    │   └── spec_5_target_mapping.md
    ├── tests/                        ← Test thủ công        (đã có sẵn, KHÔNG CHẠM)
    ├── cache/                        ← Cache API response   (đã có sẵn, KHÔNG CHẠM)
    ├── data/                         ← Data files           (đã có sẵn, KHÔNG CHẠM)
    └── src/                          ← **CODE DUY NHẤT CẦN TẠO** ─ hiện đang RỖNG
```

### Các ràng buộc Monorepo

| Quy tắc | Chi tiết |
|:---------|:---------|
| **Không tạo file ngoài `data-pipeline/src/`** | Không sửa backend, frontend, ai-core, infrastructure |
| **Database đã tồn tại** | Bảng Dim/Fact do `infrastructure/postgres/*.sql` tạo. Pipeline chỉ INSERT/UPSERT dữ liệu |
| **Docker service name** | `data-pipeline` chạy trên port 8001 (host) → 8000 (container) |
| **Env file** | `data-pipeline/.env` đã có sẵn các key: `TOMTOM_API_KEY`, `OPENWEATHER_API_KEY`, `SERPAPI_KEY`, `DB_*` |
| **Python version** | 3.9+ (theo Dockerfile `python:3.9-slim-bullseye`) |

---

## 2. CẤU TRÚC THƯ MỤC CHI TIẾT (DIRECTORY TREE)

Tạo **chính xác** các file sau bên trong `data-pipeline/src/`. Mỗi thư mục con phải có `__init__.py`.

```
data-pipeline/src/
│
├── __init__.py                         # Package marker (rỗng)
│
├── core/                               # ══ TẦNG 1: NỀN TẢNG ══
│   ├── __init__.py                     # Export: settings, get_engine, get_session, get_logger, exceptions
│   ├── config.py                       # Pydantic-settings: load .env → Settings object
│   ├── database.py                     # SQLAlchemy Engine (singleton), SessionLocal, health_check()
│   ├── logger.py                       # logging.Logger factory: console + file handler
│   └── exceptions.py                   # DataExtractionError, DataValidationError, DatabaseLoadError
│
├── schemas/                            # ══ TẦNG 2: DATA CONTRACTS ══
│   ├── __init__.py                     # Re-export tất cả schema classes
│   ├── tomtom_schema.py                # TomTomFlowSegment, TomTomFlowResponse, TomTomIncident
│   ├── weather_schema.py               # WeatherCondition, WeatherResponse, ForecastItem
│   └── osm_schema.py                   # OSMNode, OSMEdge, TrafficSignalNode
│
├── pipelines/                          # ══ TẦNG 3: NGHIỆP VỤ ETL ══
│   ├── __init__.py                     # Package marker
│   ├── base.py                         # ABC: BaseExtractor, BaseTransformer, BaseLoader
│   │
│   ├── static_dims/                    # Domain 1: Dữ liệu tĩnh (chạy 1 lần)
│   │   ├── __init__.py
│   │   ├── date_time_pipeline.py       # Sinh dim_date, dim_time_of_day, dim_month_year, dim_shift
│   │   └── holiday_pipeline.py         # Sinh dim_holiday + bridge_date_holiday
│   │
│   ├── spatial_net/                    # Domain 2: Hạ tầng không gian (chạy khi thay đổi)
│   │   ├── __init__.py
│   │   ├── osm_pipeline.py             # OSM → dim_node, dim_segment, dim_way, dim_road
│   │   └── location_pipeline.py        # Reverse-geocode → dim_location, update segment.location_key
│   │
│   ├── real_time/                      # Domain 3: Real-time (cron 15p)
│   │   ├── __init__.py
│   │   ├── traffic_pipeline.py         # TomTom Flow → fact_traffic_flow
│   │   ├── incident_pipeline.py        # TomTom Incident → fact_incident
│   │   └── weather_pipeline.py         # OpenWeather → dim_weather + join fact_traffic_flow.weather_key
│   │
│   └── ml_features/                    # Domain 4: Batch hàng đêm
│       ├── __init__.py
│       ├── baseline_pipeline.py        # Tính avg speed lịch sử → Refresh Materialized View
│       └── corridor_pipeline.py        # Tính fact_corridor_performance
│
├── utils/                              # ══ TẦNG 4: PURE FUNCTIONS ══
│   ├── __init__.py
│   ├── math_calc.py                    # calculate_traffic_index, calculate_los, calculate_pcu, ...
│   ├── weather_mapping.py              # get_weather_severity(weather_id) → 0-5
│   └── geo_ops.py                      # map_match_segment, snap_coordinate, haversine_distance
│
└── main.py                             # ══ CLI ENTRYPOINT ══ (typer)
```

### Tổng cộng: **30 file** Python cần tạo

| Tầng | Số file | Ghi chú |
|:-----|:-------:|:--------|
| `core/` | 5 | Bao gồm `__init__.py` |
| `schemas/` | 4 | 3 schema + init |
| `pipelines/` | 12 | 1 base + 4 domain × 2-3 file + inits |
| `utils/` | 4 | 3 module + init |
| root | 2 | `__init__.py` + `main.py` |
| **Tổng** | **27** | |

---

## 3. TRÁCH NHIỆM CHI TIẾT TỪNG FILE

### 3.1 Tầng Core (`src/core/`)

#### `config.py` – Quản lý cấu hình

```
Nhiệm vụ:  Load biến môi trường từ data-pipeline/.env
Thư viện:  pydantic-settings (BaseSettings)
Export:    settings (singleton instance)
```

| Biến môi trường | Settings field | Kiểu | Default | Nguồn |
|:----------------|:---------------|:-----|:--------|:------|
| `DB_HOST` | `db_host` | `str` | `"localhost"` | `.env` |
| `DB_PORT` | `db_port` | `int` | `5432` | `.env` |
| `DB_NAME` | `db_name` | `str` | `"datn-traffic-ioc"` | `.env` |
| `DB_USER` | `db_user` | `str` | `"postgres"` | `.env` |
| `DB_PASSWORD` | `db_password` | `str` | `""` | `.env` |
| `DB_SSLMODE` | `db_sslmode` | `str` | `"disable"` | `.env` |
| `TOMTOM_API_KEY` | `tomtom_api_key` | `str` | `""` | `.env` |
| `OPENWEATHER_API_KEY` | `openweather_api_key` | `str` | `""` | `.env` |
| `SERPAPI_KEY` | `serpapi_key` | `str` | `""` | `.env` |
| *(computed)* | `database_url` | `@property` | – | Tự ghép: `postgresql://{user}:{pwd}@{host}:{port}/{name}` |

> **Quan trọng:** Config KHÔNG chứa logic nghiệp vụ. Chỉ đọc biến môi trường.

#### `database.py` – Kết nối PostgreSQL

```
Nhiệm vụ:  Tạo SQLAlchemy Engine (singleton) + SessionLocal factory
Thư viện:  sqlalchemy 2.0, psycopg2-binary
Export:    get_engine(), get_session() (context manager), health_check()
```

| Tham số Engine | Giá trị | Lý do |
|:---------------|:--------|:------|
| `pool_size` | `5` | Đủ cho 4 domain pipeline chạy song song |
| `max_overflow` | `10` | Buffer cho peak load |
| `pool_pre_ping` | `True` | Tự kiểm tra connection còn sống |
| `pool_recycle` | `1800` | Tái tạo sau 30 phút (tránh timeout PG) |

Hàm `get_session()` phải là **context manager** (`@contextmanager`) với auto-commit khi thành công và auto-rollback khi exception.

#### `logger.py` – Structured Logging

```
Nhiệm vụ:  Tạo logger instance với format chuẩn
Export:    get_logger(name: str) → logging.Logger
Format:    [2026-02-28 14:30:00] INFO     src.pipelines.real_time.traffic | Extracted 150 segments
```

- Console handler: Luôn bật (stdout)
- File handler: Bật khi env `LOG_DIR` được set → ghi vào `{LOG_DIR}/data_pipeline.log`
- Level: Đọc từ `settings.LOG_LEVEL` (default `"INFO"`)

#### `exceptions.py` – Custom Exceptions

```
Nhiệm vụ:  Định nghĩa exception hierarchy
Export:    PipelineError (base), DataExtractionError, DataValidationError, DatabaseLoadError
```

Cây kế thừa:
```
PipelineError (Exception)
├── DataExtractionError      ← Extractor gọi API thất bại (sau hết retry)
├── DataValidationError      ← Pydantic schema reject dữ liệu
└── DatabaseLoadError        ← INSERT/UPSERT vào DB lỗi
```

Mỗi exception phải có attribute `message: str` và `detail: str | None`.

---

### 3.2 Tầng Schemas (`src/schemas/`)

> **Nguyên tắc:** Mọi dữ liệu thô (raw JSON) từ API bên ngoài **BẮT BUỘC** phải đi qua Pydantic Model V2 ở tầng này trước khi vào Transformer. Đây là lớp bảo vệ dữ liệu (Data Contract).

#### `tomtom_schema.py`

| Class | Mô tả | Dùng trong |
|:------|:------|:-----------|
| `TomTomCoordinate` | `{latitude: float, longitude: float}` | Nested trong Flow & Incident |
| `TomTomFlowSegment` | Validate `flowSegmentData` object | `real_time/traffic_pipeline.py` |
| `TomTomFlowResponse` | Wrapper: `{flowSegmentData: TomTomFlowSegment}` | Extract entry point |
| `TomTomIncidentProperties` | Validate `properties` trong Incident GeoJSON | `real_time/incident_pipeline.py` |
| `TomTomIncidentFeature` | Validate 1 Feature: `{geometry, properties}` | `real_time/incident_pipeline.py` |

Alias mapping (camelCase → snake_case):
- `currentSpeed` → `current_speed`
- `freeFlowSpeed` → `free_flow_speed`
- `currentTravelTime` → `current_travel_time`
- `freeFlowTravelTime` → `free_flow_travel_time`
- `roadClosure` → `road_closure`
- `iconCategory` → `icon_category`
- `magnitudeOfDelay` → `magnitude_of_delay`

#### `weather_schema.py`

| Class | Mô tả | Dùng trong |
|:------|:------|:-----------|
| `WeatherCondition` | `{id, main, description, icon}` | Nested |
| `WeatherMain` | `{temp, feels_like, humidity, pressure}` | Nested |
| `WeatherWind` | `{speed, deg, gust}` | Nested, Optional |
| `WeatherResponse` | Full Current Weather response | `real_time/weather_pipeline.py` |
| `ForecastItem` | 1 item trong `list[]` của Forecast 5d/3h | `real_time/weather_pipeline.py` |

Validator: `weather[0].id` phải nằm trong khoảng 200–900.

#### `osm_schema.py`

| Class | Mô tả | Dùng trong |
|:------|:------|:-----------|
| `OSMNode` | `{osmid, x, y, street_count, highway}` | `spatial_net/osm_pipeline.py` |
| `OSMEdge` | `{from_node, to_node, osmid, name, highway, length, oneway, lanes, maxspeed, geometry}` | `spatial_net/osm_pipeline.py` |
| `TrafficSignalNode` | `{osmid, lat, lon, highway, crossing}` | `spatial_net/osm_pipeline.py` |

> Lưu ý: OSM data đến từ `osmnx` (GeoDataFrame), không phải JSON API. Schema dùng để validate **sau khi** convert GeoDataFrame → list[dict].

---

### 3.3 Tầng Pipelines (`src/pipelines/`)

#### `base.py` – Abstract Base Classes

Xem chi tiết tại **`spec_2_base_interface.md`**. Tóm tắt:

```python
# 3 ABC classes:
class BaseExtractor(ABC):
    @abstractmethod
    def extract(self, **kwargs) -> Any: ...         # Có @retry(tenacity)

class BaseTransformer(ABC):
    @abstractmethod
    def transform(self, raw_data: Any) -> list[dict]: ...   # Pure function

class BaseLoader(ABC):
    def __init__(self, engine: Engine): ...
    @abstractmethod
    def load(self, records: list[dict]) -> int: ...         # Return số record đã load
```

#### Domain 1: `static_dims/` – Dữ liệu tĩnh

| File | Bảng Target | Khi nào chạy | Input |
|:-----|:------------|:-------------|:------|
| `date_time_pipeline.py` | `dim_month_year`, `dim_date`, `dim_time_of_day`, `dim_shift` | 1 lần khi init DB | Tham số: `start_year`, `end_year` |
| `holiday_pipeline.py` | `dim_holiday`, `bridge_date_holiday` | 1 lần + cập nhật hàng năm | Danh sách ngày lễ VN hardcode |

**Luồng `date_time_pipeline.py`:**
```
Không có Extractor (sinh từ code)
  │
  ▼
Transformer: sinh tất cả rows cho 2024-2027
  │  dim_month_year: 48 rows (4 năm × 12 tháng)
  │  dim_date:       ~1461 rows (4 năm × 365 ngày)
  │  dim_time_of_day: 1440 rows (0–1439 phút)
  │  dim_shift:      4 rows (SANG, TRUA, CHIEU, DEM)
  │
  ▼
Loader: UPSERT (ON CONFLICT DO NOTHING) → PostgreSQL
```

**Ca trực định nghĩa:**
| shift_key | shift_code | Giờ bắt đầu | Giờ kết thúc | is_business |
|:---------:|:-----------|:-----------:|:-----------:|:----------:|
| 1 | `SANG` | 06:00 (360) | 12:00 (720) | True |
| 2 | `TRUA` | 12:00 (720) | 14:00 (840) | True |
| 3 | `CHIEU` | 14:00 (840) | 22:00 (1320) | True |
| 4 | `DEM` | 22:00 (1320) | 06:00 (360) | False |

#### Domain 2: `spatial_net/` – Mạng lưới đường

| File | Bảng Target | Khi nào chạy | Input |
|:-----|:------------|:-------------|:------|
| `osm_pipeline.py` | `dim_node`, `dim_road`, `dim_way`, `dim_segment` | 1 lần + khi OSM cập nhật | OSMnx → GeoDataFrame |
| `location_pipeline.py` | `dim_location` + UPDATE `dim_segment.location_key` | Sau osm_pipeline | Reverse-geocode hoặc admin boundary |

**Luồng `osm_pipeline.py`:**
```
Extractor: osmnx.graph_from_place("District 1, Ho Chi Minh City", network_type="drive")
  │  → G (NetworkX graph)
  │  → nodes_gdf, edges_gdf = ox.graph_to_gdfs(G)
  │
  ▼
Transformer:
  │  1. Validate qua OSMNode / OSMEdge schema
  │  2. Phân loại node_type (signalized / intersection / terminal)
  │  3. Group edges by road name → dim_road rows
  │  4. Group edges by (road_key + direction) → dim_way rows
  │  5. Mỗi edge → 1 dim_segment row
  │  6. Fallback defaults cho lanes (58.5% thiếu) và maxspeed (30% thiếu)
  │
  ▼
Loader:
  │  Thứ tự INSERT bắt buộc (do FK constraints):
  │    ① dim_node        (987 rows, Quận 1)
  │    ② dim_road        (~60 tên đường)
  │    ③ dim_way         (~200 ways)
  │    ④ dim_segment     (2081 edges)
  │  Phương pháp: UPSERT ON CONFLICT (node_key) DO UPDATE record_timestamp
  │  PostGIS: Dùng func.ST_GeomFromText(wkt, 4326) cho cột geometry
  │
  ▼
PostgreSQL: dim_node, dim_road, dim_way, dim_segment
```

**Fallback defaults** (khi OSM thiếu dữ liệu):

| `highway` type | Default `lanes` | Default `maxspeed` (km/h) | Default `FRC` |
|:---------------|:---------------:|:-------------------------:|:-------------:|
| `trunk` | 4 | 60 | 0 |
| `primary` | 3 | 50 | 2 |
| `secondary` | 2 | 40 | 4 |
| `tertiary` | 2 | 40 | 5 |
| `residential` | 2 | 30 | 6 |
| `living_street` | 1 | 20 | 6 |

#### Domain 3: `real_time/` – ETL Thời gian thực

| File | Bảng Target | Tần suất | Input API |
|:-----|:------------|:---------|:----------|
| `traffic_pipeline.py` | `fact_traffic_flow` | 15 phút | TomTom Traffic Flow v4 |
| `incident_pipeline.py` | `fact_incident` | 15 phút | TomTom Incident Details v5 |
| `weather_pipeline.py` | `dim_weather` | 15 phút | OpenWeather Current 2.5 |

**Luồng `traffic_pipeline.py` (quan trọng nhất):**
```
Extractor: GET TomTom Flow API cho mỗi segment point
  │  - Duyệt danh sách tọa độ trung tâm từ dim_segment
  │  - Gọi API: /traffic/services/4/flowSegmentData/absolute/{zoom}/{lat},{lon}
  │  - Rate limit: ~2500 req/day → ưu tiên primary/secondary roads
  │  - Retry: 3 lần, wait 2s (tenacity)
  │
  ▼
Transformer: (Chi tiết xem spec_4_business_logic.md)
  │  Với mỗi API response:
  │    raw = TomTomFlowResponse.model_validate(json)    ← Schema validation
  │    segment_key = map_match(coordinates → dim_segment) ← geo_ops.py
  │    delay       = calc_delay(currentTravelTime, freeFlowTravelTime)
  │    traffic_idx = calc_traffic_index(currentSpeed, freeFlowSpeed)
  │    los         = calc_los_level(traffic_idx)
  │    congestion  = calc_congestion_level(los)
  │    quality     = round(confidence * 9)
  │    time_key    = hour * 60 + minute
  │    date_key    = int(timestamp.strftime("%Y%m%d"))
  │
  │  Output: list[dict] với keys khớp 100% cột fact_traffic_flow
  │
  ▼
Loader: (Chi tiết xem spec_5_target_mapping.md)
  │  UPSERT: ON CONFLICT (traffic_flow_key, date_key) DO UPDATE
  │  Batch size: 500 rows/transaction
  │  Gắn inserted_at = datetime.utcnow()
  │
  ▼
PostgreSQL: fact_traffic_flow (partitioned by date_key)
```

**Luồng `incident_pipeline.py`:**
```
Extractor: GET TomTom Incident Details v5
  │  - BBox: 106.663,10.743,106.723,10.803 (Quận 1)
  │  - 1 request trả về tất cả incidents trong bbox
  │
  ▼
Transformer:
  │  - Validate qua TomTomIncidentFeature schema
  │  - incident_key = hash(properties.id) → BIGINT
  │  - incident_type = MAP iconCategory (1→accident, 6→jam, 8→road_closed, 9→road_works)
  │  - geometry = centroid of LineString → POINT
  │  - segment_key = map_match(centroid → nearest dim_segment)
  │
  ▼
Loader: UPSERT ON CONFLICT (incident_key, date_key) DO UPDATE
  │
  ▼
PostgreSQL: fact_incident (partitioned by date_key)
```

**Luồng `weather_pipeline.py`:**
```
Extractor: GET OpenWeather Current
  │  - URL: /data/2.5/weather?lat=10.7764&lon=106.7011&units=metric&lang=vi
  │  - 1 request duy nhất / lần chạy
  │
  ▼
Transformer:
  │  - Validate qua WeatherResponse schema
  │  - weather_key = weather[0].id (PK)
  │  - severity_level = get_weather_severity(weather_id)  ← weather_mapping.py
  │
  ▼
Loader: UPSERT dim_weather ON CONFLICT (weather_key) DO NOTHING
  │  - Trả về weather_key để traffic_pipeline gắn vào fact_traffic_flow.weather_key
  │
  ▼
PostgreSQL: dim_weather
```

> **Thứ tự chạy 3 pipeline real-time trong 1 cron cycle:**
> 1. `weather_pipeline.run()` → trả về `weather_key`
> 2. `traffic_pipeline.run(weather_key=weather_key)` → gắn FK weather
> 3. `incident_pipeline.run()`

#### Domain 4: `ml_features/` – Batch tính toán

| File | Mục đích | Tần suất |
|:-----|:---------|:---------|
| `baseline_pipeline.py` | Tính avg speed lịch sử per segment per time_bucket | Hàng đêm 2h sáng |
| `corridor_pipeline.py` | Tính hiệu suất hành lang → `fact_corridor_performance` | Hàng đêm sau baseline |

> **Phase 2** – Có thể triển khai sau khi Domain 1-3 hoàn thành.

---

### 3.4 Tầng Utils (`src/utils/`)

> **Nguyên tắc tuyệt đối:** Mọi hàm trong `utils/` là **Pure Functions**. Không import `database`, `config`, `requests`, hoặc bất kỳ module nào có side-effect. Chỉ nhận primitive types (float, int, str, dict, list) và trả về kết quả. Đảm bảo 100% unit-testable.

#### `math_calc.py`

| Hàm | Signature | Mô tả |
|:----|:----------|:------|
| `calculate_traffic_index` | `(current_speed: float, free_flow_speed: float) → float` | `1.0 - (cs/ffs)`, clamp [0.0, 1.0] |
| `calculate_los_level` | `(traffic_index: float) → str` | A–F theo ngưỡng HCM 2010 |
| `calculate_congestion_level` | `(los_level: str) → int` | A→0, B→1, ..., F→5 |
| `calculate_delay_seconds` | `(current_tt: int, freeflow_tt: int) → int` | `max(0, current - freeflow)` |
| `calculate_pcu` | `(motorcycles: int, cars: int, buses: int) → float` | `mc*0.25 + car*1.0 + bus*2.0` |
| `generate_traffic_flow_key` | `(segment_key: int, timestamp: datetime) → int` | Deterministic hash → BIGINT |

Xem spec chi tiết: **`spec_4_business_logic.md`**

#### `weather_mapping.py`

| Hàm | Signature | Mô tả |
|:----|:----------|:------|
| `get_weather_severity` | `(weather_id: int) → int` | OWM id → severity 0-5 |
| `get_icon_category_type` | `(icon_category: int) → str` | TomTom icon → incident_type string |

#### `geo_ops.py`

| Hàm | Signature | Mô tả |
|:----|:----------|:------|
| `haversine_distance` | `(lat1, lon1, lat2, lon2) → float` | Khoảng cách mét giữa 2 tọa độ |
| `find_nearest_segment` | `(lat, lon, segments_gdf) → int` | Trả về segment_key gần nhất |
| `linestring_centroid` | `(coords: list[tuple]) → tuple[float,float]` | Tọa độ trung tâm LineString |
| `coords_to_wkt_point` | `(lon, lat) → str` | `"POINT(106.7 10.78)"` |
| `coords_to_wkt_linestring` | `(coords) → str` | WKT LineString |

> `geo_ops.py` **được phép** import `shapely` và `geopandas` (thư viện pure geometry, không có IO).

---

### 3.5 Entrypoint (`src/main.py`)

```
Nhiệm vụ:  CLI điều phối tất cả pipeline thông qua typer
Thư viện:  typer
Import:    core.database, core.logger, tất cả pipeline classes
```

#### Các lệnh CLI

| Lệnh | Mô tả | Ví dụ |
|:------|:------|:------|
| `run-static` | Chạy tất cả pipeline Domain 1 (static_dims) | `python -m src.main run-static --start-year 2024 --end-year 2027` |
| `run-spatial` | Chạy tất cả pipeline Domain 2 (spatial_net) | `python -m src.main run-spatial --area "District 1, Ho Chi Minh City"` |
| `run-realtime` | Chạy 1 cycle real-time (Domain 3) | `python -m src.main run-realtime` |
| `run-batch` | Chạy pipeline tính toán batch (Domain 4) | `python -m src.main run-batch` |
| `run-all` | Chạy tuần tự: static → spatial → realtime | `python -m src.main run-all` |
| `health` | Kiểm tra kết nối DB + API keys | `python -m src.main health` |

#### Luồng xử lý trong `run-realtime`:

```python
@app.command()
def run_realtime():
    engine = get_engine()
    logger = get_logger("main")

    # 1. Weather trước (lấy weather_key cho traffic)
    weather_key = WeatherPipeline(engine).run()
    logger.info(f"Weather done: weather_key={weather_key}")

    # 2. Traffic flow (gắn weather_key)
    count = TrafficPipeline(engine).run(weather_key=weather_key)
    logger.info(f"Traffic done: {count} records upserted")

    # 3. Incidents (độc lập)
    count = IncidentPipeline(engine).run()
    logger.info(f"Incidents done: {count} records upserted")
```

#### Chạy trong Docker:

```bash
# Từ host (ngoài container)
docker-compose exec data-pipeline python -m src.main run-static
docker-compose exec data-pipeline python -m src.main run-realtime

# Cron job (thêm vào crontab hoặc docker-compose command)
*/15 * * * * docker-compose exec -T data-pipeline python -m src.main run-realtime
```

---

## 4. BIỂU ĐỒ LUỒNG DỮ LIỆU TỔNG THỂ (DATA FLOW DIAGRAM)

```
                            ┌──────────────────────────────────┐
                            │        EXTERNAL APIs             │
                            │  TomTom  │  OpenWeather  │  OSM  │
                            └────┬─────┴──────┬────────┴──┬────┘
                                 │            │           │
                    ┌────────────▼────────────▼───────────▼──────────┐
                    │              src/schemas/ (Pydantic V2)         │
                    │  TomTomFlowResponse │ WeatherResponse │ OSMNode │
                    └────────────┬────────────┬───────────┬──────────┘
                                 │            │           │
                    ┌────────────▼────────────▼───────────▼──────────┐
                    │              src/pipelines/                      │
                    │                                                  │
                    │  ┌───────────┐  ┌────────────┐  ┌───────────┐  │
                    │  │ Extractor │→ │ Transformer │→ │  Loader   │  │
                    │  │  (fetch)  │  │ (validate   │  │ (UPSERT)  │  │
                    │  │           │  │  + compute) │  │           │  │
                    │  └───────────┘  └─────┬──────┘  └─────┬─────┘  │
                    │                       │               │         │
                    │         ┌──────────────┘               │         │
                    │         ▼                               │         │
                    │  src/utils/ (pure)                      │         │
                    │  math_calc, geo_ops,                    │         │
                    │  weather_mapping                        │         │
                    └─────────────────────────────────────────┼─────────┘
                                                              │
                                                              ▼
                    ┌──────────────────────────────────────────────────┐
                    │          PostgreSQL 15 + PostGIS                  │
                    │                                                    │
                    │  ┌─────────────────┐    ┌──────────────────────┐ │
                    │  │  Dimensions     │    │  Facts (Partitioned) │ │
                    │  │  dim_node       │◄───│  fact_traffic_flow   │ │
                    │  │  dim_segment    │◄───│  fact_incident       │ │
                    │  │  dim_weather    │◄───│  fact_event          │ │
                    │  │  dim_date       │    │  fact_risk_prediction│ │
                    │  │  dim_time_of_day│    │  fact_simulation     │ │
                    │  │  dim_road/way   │    │  fact_corridor_perf  │ │
                    │  └─────────────────┘    └──────────────────────┘ │
                    └──────────────────────────────────────────────────┘
```

---

## 5. DEPENDENCY GRAPH (THỨ TỰ IMPORT)

```
main.py
  ├── core/config       ← Không import gì trong src/
  ├── core/database     ← import core/config
  ├── core/logger       ← import core/config
  ├── core/exceptions   ← Không import gì trong src/
  │
  ├── schemas/*         ← import core/exceptions (raise DataValidationError)
  │
  ├── pipelines/base    ← import core/exceptions, core/logger
  ├── pipelines/*/      ← import base, schemas, utils, core/database, core/logger
  │
  └── utils/*           ← KHÔNG IMPORT GÌ TRONG SRC/* (trừ shapely/geopandas thư viện ngoài)
```

**Quy tắc import:**
1. `utils/` → Không import bất kỳ module nào trong `src/`
2. `core/` → Chỉ import lẫn nhau (`database` import `config`)
3. `schemas/` → Chỉ import `core/exceptions`
4. `pipelines/` → Import tất cả tầng khác (downstream consumer)
5. `main.py` → Import tất cả

> **Cấm tuyệt đối:** import vòng (circular import).

---

## 6. REQUIREMENTS.TXT – THƯ VIỆN CẦN BỔ SUNG

File `data-pipeline/requirements.txt` hiện có sẵn một số thư viện. Cần **thêm** các thư viện sau (giữ nguyên những gì đã có):

| Thư viện | Phiên bản | Lý do |
|:---------|:----------|:------|
| `pydantic` | `>=2.0` | Schema validation (Data Contracts) |
| `pydantic-settings` | `>=2.0` | Load .env → Settings |
| `tenacity` | `>=8.0` | Retry decorator cho Extractor |
| `typer` | `>=0.9` | CLI framework (main.py) |
| `pyproj` | `>=3.6` | Chuyển đổi CRS (WGS84 ↔ UTM) |

> Các thư viện đã có sẵn: `pandas`, `requests`, `sqlalchemy`, `psycopg2-binary`, `geopandas`, `osmnx`, `shapely`, `fastapi`, `uvicorn`.

---

## 7. RÀNG BUỘC RUNTIME (CONSTRAINTS)

### 7.1 Biến môi trường bắt buộc

Các biến sau **phải có** trong `data-pipeline/.env` để pipeline chạy được:

| Biến | Bắt buộc cho | Ví dụ |
|:-----|:-------------|:------|
| `DB_HOST` | Tất cả pipeline | `localhost` hoặc `postgres` (trong Docker) |
| `DB_PORT` | Tất cả pipeline | `5432` |
| `DB_NAME` | Tất cả pipeline | `datn-traffic-ioc` |
| `DB_USER` | Tất cả pipeline | `postgres` |
| `DB_PASSWORD` | Tất cả pipeline | `123456` |
| `TOMTOM_API_KEY` | Domain 3 (real_time) | `nYiEt...` |
| `OPENWEATHER_API_KEY` | Domain 3 (real_time) | `3ffe1...` |

### 7.2 Database phải được init trước

Pipeline giả định các bảng đã được tạo bởi:
```
infrastructure/postgres/1_init_extensions.sql  → PostGIS, pgRouting
infrastructure/postgres/2_create_dims.sql      → 12 bảng Dimension
infrastructure/postgres/3_create_facts.sql     → 6 bảng Fact (có Partition)
infrastructure/postgres/4_indexes.sql          → Indexes
```

Pipeline **KHÔNG** tạo bảng. Chỉ INSERT/UPSERT dữ liệu.

### 7.3 Thứ tự chạy pipeline lần đầu

```
1. health                    ← Kiểm tra DB connection + API keys
2. run-static                ← Sinh dim_date, dim_time_of_day, dim_shift, dim_month_year, dim_holiday
3. run-spatial               ← Nạp dim_node, dim_road, dim_way, dim_segment, dim_location
4. run-realtime              ← Bắt đầu ETL thời gian thực (có thể cron)
5. run-batch (optional)      ← Tính toán ML features
```

> **Không được chạy `run-realtime` trước `run-spatial`** vì traffic_pipeline cần dim_segment để map-match.

### 7.4 API Rate Limits

| API | Giới hạn | Chiến lược |
|:----|:---------|:-----------|
| TomTom | 2,500 req/day (Free) | Chỉ query primary + secondary roads (~300 segments). Cache 15 phút |
| OpenWeather | 1,000 req/day (Free) | 1 call/cycle × 96 cycles/day = 96 req/day |
| OSMnx / Overpass | Không giới hạn cứng | Chạy 1 lần, cache local |

---

## 8. THAM CHIẾU CHÉO GIỮA CÁC SPEC

| Khi cần biết... | Đọc spec nào |
|:-----------------|:-------------|
| Tạo file ở đâu, luồng chạy thế nào | **Spec 1** (file này) |
| BaseExtractor / BaseTransformer / BaseLoader interface | **Spec 2** (`spec_2_base_interface.md`) |
| Cấu trúc JSON raw từ API, Field Contract | **Spec 3** (`spec_3_data_contracts.md`) |
| Công thức tính traffic_index, LOS, PCU, weather severity | **Spec 4** (`spec_4_business_logic.md`) |
| Quy tắc UPSERT, column mapping, PostGIS format | **Spec 5** (`spec_5_target_mapping.md`) |
| Cấu trúc bảng Dimension | `infrastructure/postgres/2_create_dims.sql` |
| Cấu trúc bảng Fact + Partition | `infrastructure/postgres/3_create_facts.sql` |
| Indexes (BRIN, GiST, B-Tree) | `infrastructure/postgres/4_indexes.sql` |

---

> **Checkpoint cho Agent:** Sau khi đọc xong spec này, Agent phải có thể trả lời được:
> 1. Cần tạo bao nhiêu file? → **27 file**
> 2. File nào tạo trước? → `core/` → `schemas/` → `utils/` → `pipelines/base.py` → `pipelines/*/` → `main.py`
> 3. Import chain? → `utils` ← `schemas` ← `pipelines` ← `main.py`, tất cả dùng `core/`
> 4. Pipeline nào chạy trước? → `static_dims` → `spatial_net` → `real_time` → `ml_features`
> 5. Data đi vào DB bằng gì? → UPSERT (ON CONFLICT) qua SQLAlchemy 2.0