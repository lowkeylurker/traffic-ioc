# SPEC 5 – ĐẶC TẢ GHI DỮ LIỆU & ÁNH XẠ DATABASE (TARGET DATABASE MAPPING SPECIFICATION)

## Quy tắc UPSERT, ánh xạ cột, PostGIS, batch insert, và thứ tự nạp cho mọi bảng target

| Metadata | Giá trị |
|:---------|:--------|
| **Phiên bản** | 2.0 |
| **Ngày cập nhật** | 2026-02-28 |
| **Phạm vi** | Tất cả Loader classes trong `data-pipeline/src/pipelines/*/` |
| **Specs liên quan** | `spec_2` (BaseLoader ABC), `spec_3` (field contracts), `spec_4` (business logic) |
| **DB Schema** | `infrastructure/postgres/2_create_dims.sql`, `3_create_facts.sql` |
| **Code tham chiếu** | `src/pipelines/base.py` → `BaseLoader` |

---

## MỤC ĐÍCH

File này quy định **chính xác** cách Loader ghi dữ liệu vào PostgreSQL:

1. **Column Mapping** – Tên key trong `list[dict]` PHẢI khớp 100% tên cột DB.
2. **UPSERT Strategy** – Conflict target, DO UPDATE/DO NOTHING cho từng bảng.
3. **PostGIS Handling** – Cách ghi geometry columns.
4. **FK Insert Order** – Thứ tự bắt buộc khi insert (tránh FK violation).
5. **Batch Performance** – Kích thước batch, transaction handling.
6. **System Fields** – `inserted_at`, `record_timestamp` tự động.
7. **Error Handling** – Rollback strategy, retry policy.

> **QUY TẮC TUYỆT ĐỐI:** Agent khi viết Loader PHẢI sử dụng `sqlalchemy.dialects.postgresql.insert` + `on_conflict_do_update` / `on_conflict_do_nothing`. KHÔNG BAO GIỜ dùng `session.add()` hoặc `session.add_all()`.

---

## MỤC LỤC

1. [Nguyên tắc chung](#1-nguyên-tắc-chung)
2. [UPSERT Pattern – SQLAlchemy 2.0 Code Template](#2-upsert-pattern--sqlalchemy-20-code-template)
3. [Bảng Fact: fact_traffic_flow](#3-bảng-fact-fact_traffic_flow)
4. [Bảng Fact: fact_incident](#4-bảng-fact-fact_incident)
5. [Bảng Fact: fact_event](#5-bảng-fact-fact_event)
6. [Bảng Dimension: dim_weather](#6-bảng-dimension-dim_weather)
7. [Bảng Dimension: dim_node](#7-bảng-dimension-dim_node)
8. [Bảng Dimension: dim_segment](#8-bảng-dimension-dim_segment)
9. [Bảng Dimension: dim_way](#9-bảng-dimension-dim_way)
10. [Bảng Dimension: dim_road](#10-bảng-dimension-dim_road)
11. [Bảng Dimension: dim_location](#11-bảng-dimension-dim_location)
12. [Bảng Dimension: dim_date, dim_time_of_day, dim_month_year, dim_shift](#12-bảng-dimension-thời-gian)
13. [Bảng Dimension: dim_holiday + bridge_date_holiday](#13-bảng-dimension-dim_holiday--bridge)
14. [FK Insert Order – Thứ tự nạp bắt buộc](#14-fk-insert-order--thứ-tự-nạp-bắt-buộc)
15. [Batch Performance Rules](#15-batch-performance-rules)
16. [Error Handling & Transaction Strategy](#16-error-handling--transaction-strategy)
17. [PostGIS Geometry Patterns](#17-postgis-geometry-patterns)

---

## 1. Nguyên tắc chung

### 1.1 Column Mapping Rule

```
Tên key trong dict (output của Transformer) == tên cột trong PostgreSQL (snake_case)
```

**Ví dụ:**
```python
# Output từ Transformer:
record = {
    "traffic_flow_key": 123456789,
    "segment_key": 987654321,
    "date_key": 20260228,
    "time_key": 870,
    "current_speed_kmh": 17.5,
    # ... khớp 100% tên cột trong fact_traffic_flow
}
```

> **KHÔNG** đặt tên khác (VD: `currentSpeed`, `speed`, `traffic_flow_id`). PHẢI đúng tên cột DB.

### 1.2 System Timestamps

| Bảng loại | Cột | Giá trị | Khi nào gắn |
|:----------|:----|:--------|:-------------|
| **Fact** | `inserted_at` | `datetime.utcnow()` | Mỗi lần INSERT hoặc UPDATE |
| **Dimension** | `record_timestamp` | `datetime.utcnow()` | Mỗi lần INSERT hoặc UPDATE |

```python
from datetime import datetime

# Gắn trong Loader trước khi execute:
for record in records:
    record["inserted_at"] = datetime.utcnow()  # Fact tables
    # hoặc
    record["record_timestamp"] = datetime.utcnow()  # Dimension tables
```

### 1.3 SQLAlchemy 2.0 Only

| Cho phép | CẤM |
|:---------|:----|
| `session.execute(insert_stmt, records)` | `session.add()` |
| `insert().on_conflict_do_update()` | `session.add_all()` |
| `insert().on_conflict_do_nothing()` | `session.merge()` |
| `text()` cho raw SQL khi cần | ORM-style insert |

---

## 2. UPSERT Pattern – SQLAlchemy 2.0 Code Template

### 2.1 DO UPDATE Pattern (cho Fact tables)

```python
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import Table, MetaData, text
from datetime import datetime

def upsert_batch_do_update(
    session,
    table: Table,
    records: list[dict],
    conflict_columns: list[str],
    update_columns: list[str],
    batch_size: int = 500,
) -> int:
    """
    Batch UPSERT với ON CONFLICT DO UPDATE.
    
    Args:
        session: SQLAlchemy Session
        table: SQLAlchemy Table object
        records: List of dicts (keys = column names)
        conflict_columns: Columns forming the conflict target (PK)
        update_columns: Columns to update on conflict
        batch_size: Records per transaction batch
    
    Returns:
        int: Total records upserted
    """
    total = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        stmt = insert(table).values(batch)
        update_dict = {col: stmt.excluded[col] for col in update_columns}
        stmt = stmt.on_conflict_do_update(
            index_elements=conflict_columns,
            set_=update_dict,
        )
        session.execute(stmt)
        session.commit()
        total += len(batch)
    return total
```

### 2.2 DO NOTHING Pattern (cho Dimension tables tĩnh)

```python
def upsert_batch_do_nothing(
    session,
    table: Table,
    records: list[dict],
    conflict_columns: list[str],
    batch_size: int = 1000,
) -> int:
    """
    Batch UPSERT với ON CONFLICT DO NOTHING.
    Dùng cho dimension tables mà dữ liệu ít thay đổi.
    """
    total = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        stmt = insert(table).values(batch)
        stmt = stmt.on_conflict_do_nothing(index_elements=conflict_columns)
        session.execute(stmt)
        session.commit()
        total += len(batch)
    return total
```

---

## 3. Bảng Fact: `fact_traffic_flow`

### 3.1 DDL Reference

```sql
CREATE TABLE fact_traffic_flow (
    traffic_flow_key    BIGINT NOT NULL,
    segment_key         BIGINT NOT NULL REFERENCES dim_segment(segment_key),
    time_key            INT    NOT NULL REFERENCES dim_time_of_day(time_key),
    date_key            INT    NOT NULL REFERENCES dim_date(date_key),
    weather_key         INT    REFERENCES dim_weather(weather_key),
    timestamp           TIMESTAMP NOT NULL,
    pcu_volume          DECIMAL(10,2),
    traffic_index       DECIMAL(3,2),
    current_speed_kmh   DECIMAL(5,2),
    free_flow_speed_kmh DECIMAL(5,2),
    delay_seconds       INT,
    los_level           CHAR(1),
    congestion_level    SMALLINT,
    is_closed           BOOLEAN DEFAULT FALSE,
    inserted_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag        SMALLINT DEFAULT 1,
    PRIMARY KEY (traffic_flow_key, date_key)
) PARTITION BY RANGE (date_key);
```

### 3.2 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(traffic_flow_key, date_key)` – Composite PK (bắt buộc do partitioning) |
| **On Conflict Action** | `DO UPDATE` |
| **Update Columns** | `current_speed_kmh`, `free_flow_speed_kmh`, `pcu_volume`, `traffic_index`, `delay_seconds`, `los_level`, `congestion_level`, `is_closed`, `quality_flag`, `inserted_at` |
| **Không update** | `traffic_flow_key`, `segment_key`, `time_key`, `date_key`, `weather_key`, `timestamp` (immutable keys) |
| **Batch Size** | 500 |

### 3.3 Loader Implementation

```python
# Trong TrafficLoader.load():
from sqlalchemy.dialects.postgresql import insert

CONFLICT_KEYS = ["traffic_flow_key", "date_key"]
UPDATE_COLUMNS = [
    "current_speed_kmh", "free_flow_speed_kmh", "pcu_volume",
    "traffic_index", "delay_seconds", "los_level",
    "congestion_level", "is_closed", "quality_flag", "inserted_at",
]

def load(self, records: list[dict]) -> int:
    for record in records:
        record["inserted_at"] = datetime.utcnow()

    with get_session() as session:
        total = 0
        for i in range(0, len(records), 500):
            batch = records[i : i + 500]
            stmt = insert(self.table).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=CONFLICT_KEYS,
                set_={col: stmt.excluded[col] for col in UPDATE_COLUMNS},
            )
            session.execute(stmt)
            session.commit()
            total += len(batch)
        return total
```

### 3.4 Column Mapping (Dict Key → DB Column)

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `traffic_flow_key` | `traffic_flow_key` | `BIGINT` | `generate_traffic_flow_key()` |
| `segment_key` | `segment_key` | `BIGINT` | `find_nearest_segment()` |
| `time_key` | `time_key` | `INT` | `derive_time_key()` |
| `date_key` | `date_key` | `INT` | `derive_date_key()` |
| `weather_key` | `weather_key` | `INT` | Từ `weather_pipeline.run()` |
| `timestamp` | `timestamp` | `TIMESTAMP` | `datetime.now(tz=TZ_HCM)` |
| `pcu_volume` | `pcu_volume` | `DECIMAL(10,2)` | `estimate_pcu_from_speed()` |
| `traffic_index` | `traffic_index` | `DECIMAL(3,2)` | `calculate_traffic_index()` |
| `current_speed_kmh` | `current_speed_kmh` | `DECIMAL(5,2)` | TomTom `currentSpeed` |
| `free_flow_speed_kmh` | `free_flow_speed_kmh` | `DECIMAL(5,2)` | TomTom `freeFlowSpeed` |
| `delay_seconds` | `delay_seconds` | `INT` | `calculate_delay_seconds()` |
| `los_level` | `los_level` | `CHAR(1)` | `calculate_los_level()` |
| `congestion_level` | `congestion_level` | `SMALLINT` | `calculate_congestion_level()` |
| `is_closed` | `is_closed` | `BOOLEAN` | TomTom `roadClosure` |
| `inserted_at` | `inserted_at` | `TIMESTAMP` | `datetime.utcnow()` |
| `quality_flag` | `quality_flag` | `SMALLINT` | `calculate_quality_flag()` |

---

## 4. Bảng Fact: `fact_incident`

### 4.1 DDL Reference

```sql
CREATE TABLE fact_incident (
    incident_key    BIGINT NOT NULL,
    time_key        INT    NOT NULL REFERENCES dim_time_of_day(time_key),
    date_key        INT    NOT NULL REFERENCES dim_date(date_key),
    segment_key     BIGINT NOT NULL REFERENCES dim_segment(segment_key),
    location_key    BIGINT REFERENCES dim_location(location_key),
    incident_type   VARCHAR(50),
    timestamp       TIMESTAMP NOT NULL,
    severity_level  SMALLINT,
    delay_seconds   INT,
    geometry        GEOMETRY(Point, 4326),
    is_simulated    BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    inserted_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag    SMALLINT DEFAULT 1,
    PRIMARY KEY (incident_key, date_key)
) PARTITION BY RANGE (date_key);
```

### 4.2 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(incident_key, date_key)` – Composite PK |
| **On Conflict Action** | `DO UPDATE` |
| **Update Columns** | `severity_level`, `delay_seconds`, `is_active`, `quality_flag`, `inserted_at` |
| **Không update** | `incident_key`, `date_key`, `segment_key`, `location_key`, `incident_type`, `timestamp`, `geometry`, `is_simulated` |
| **Batch Size** | 500 |

### 4.3 PostGIS Geometry Handling

```python
from sqlalchemy import func

# Trong incident records, geometry là WKT string:
# record["geometry"] = "POINT(106.6628 10.7557)"

# Khi build insert statement, geometry cần wrap:
# Cách 1: Dùng text() trong values
record["geometry"] = func.ST_GeomFromText(f"POINT({lon} {lat})", 4326)

# Cách 2: Dùng raw SQL binding
# INSERT INTO fact_incident (..., geometry) VALUES (..., ST_GeomFromText(:geom, 4326))
```

### 4.4 Column Mapping

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `incident_key` | `incident_key` | `BIGINT` | `generate_incident_key(properties.id)` |
| `time_key` | `time_key` | `INT` | `derive_time_key(startTime)` |
| `date_key` | `date_key` | `INT` | `derive_date_key(startTime)` |
| `segment_key` | `segment_key` | `BIGINT` | `find_nearest_segment(centroid)` |
| `location_key` | `location_key` | `BIGINT` | Reverse geocode centroid → dim_location |
| `incident_type` | `incident_type` | `VARCHAR(50)` | `get_icon_category_type(iconCategory)` |
| `timestamp` | `timestamp` | `TIMESTAMP` | `dateutil.parser.parse(startTime)` |
| `severity_level` | `severity_level` | `SMALLINT` | `normalize_magnitude(magnitudeOfDelay)` |
| `delay_seconds` | `delay_seconds` | `INT` | `properties.delay` (null → 0) |
| `geometry` | `geometry` | `GEOMETRY(Point,4326)` | `ST_GeomFromText('POINT(lon lat)', 4326)` |
| `is_simulated` | `is_simulated` | `BOOLEAN` | `False` (hardcode, real data) |
| `is_active` | `is_active` | `BOOLEAN` | `derive_is_active(endTime)` |
| `inserted_at` | `inserted_at` | `TIMESTAMP` | `datetime.utcnow()` |
| `quality_flag` | `quality_flag` | `SMALLINT` | `5` (medium confidence default) |

---

## 5. Bảng Fact: `fact_event`

### 5.1 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(event_id)` – Simple PK (không partitioned) |
| **On Conflict Action** | `DO NOTHING` (events are immutable once inserted) |
| **Batch Size** | 100 |
| **Phase** | Phase 2 – không bắt buộc MVP |

### 5.2 Column Mapping

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `event_id` | `event_id` | `BIGINT` | Hash từ title + date |
| `start_time_key` | `start_time_key` | `INT` | Parse `date.when` → minute of day |
| `end_time_key` | `end_time_key` | `INT` | Parse `date.when` → minute of day |
| `date_key` | `date_key` | `INT` | Parse `date.start_date` → YYYYMMDD |
| `location_key` | `location_key` | `BIGINT` | Geocode `address[0]` → dim_location |
| `event_type` | `event_type` | `VARCHAR(50)` | NLP inference from title |
| `attendance_scale` | `attendance_scale` | `INT` | Estimate from venue.reviews |
| `impact_radius_m` | `impact_radius_m` | `INT` | Default 500m |
| `event_title` | `event_title` | `VARCHAR(255)` | SerpApi `title` |

---

## 6. Bảng Dimension: `dim_weather`

### 6.1 DDL Reference

```sql
CREATE TABLE dim_weather (
    weather_key         INT PRIMARY KEY,
    weather_id          INT,
    main_category       VARCHAR(50),
    severity_level      SMALLINT,
    record_timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.2 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(weather_key)` – Single PK |
| **On Conflict Action** | `DO NOTHING` |
| **Lý do DO NOTHING** | Weather dimension là danh mục tĩnh (static lookup). OWM weather_id 200–804 chỉ có ~50 giá trị unique. Một khi đã insert, không cần update. |
| **Batch Size** | 50 (rất ít records) |

### 6.3 Loader Code

```python
def load(self, records: list[dict]) -> int:
    for r in records:
        r["record_timestamp"] = datetime.utcnow()

    stmt = insert(self.table).values(records)
    stmt = stmt.on_conflict_do_nothing(index_elements=["weather_key"])
    with get_session() as session:
        session.execute(stmt)
        session.commit()
    return len(records)
```

### 6.4 Column Mapping

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `weather_key` | `weather_key` | `INT` | `weather[0].id` (trực tiếp làm PK) |
| `weather_id` | `weather_id` | `INT` | `weather[0].id` |
| `main_category` | `main_category` | `VARCHAR(50)` | `weather[0].main` |
| `severity_level` | `severity_level` | `SMALLINT` | `get_weather_severity(id)` |
| `record_timestamp` | `record_timestamp` | `TIMESTAMP` | `datetime.utcnow()` |

> **Trả về `weather_key`:** Sau khi load, weather_pipeline.run() trả về `weather_key` cho traffic_pipeline sử dụng FK.

---

## 7. Bảng Dimension: `dim_node`

### 7.1 DDL Reference

```sql
CREATE TABLE dim_node (
    node_key            BIGINT PRIMARY KEY,
    node_source_id      BIGINT,
    is_snapped          BOOLEAN DEFAULT FALSE,
    node_type           VARCHAR(30),
    geometry            GEOMETRY(Point, 4326),
    record_timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7.2 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(node_key)` – Single PK |
| **On Conflict Action** | `DO UPDATE` |
| **Update Columns** | `node_type`, `is_snapped`, `record_timestamp` |
| **Lý do DO UPDATE** | Traffic signals step sẽ UPDATE `node_type = 'signalized'` cho nodes đã insert. |
| **Batch Size** | 1000 |

### 7.3 PostGIS Geometry

```python
# Geometry column cần special handling:
from sqlalchemy import func

# Cách xử lý trong Loader:
# 1. Transformer output: record["geometry_wkt"] = "POINT(106.696 10.793)"
# 2. Loader: build INSERT với func.ST_GeomFromText

stmt = insert(table).values([
    {
        "node_key": 366440881,
        "node_source_id": 366440881,
        "node_type": "intersection",
        "is_snapped": False,
        "geometry": func.ST_GeomFromText("POINT(106.696 10.793)", 4326),
        "record_timestamp": datetime.utcnow(),
    }
])
```

> **Lưu ý quan trọng:** Khi dùng `func.ST_GeomFromText` trong batch insert, cần build values list với func call cho mỗi row. Hoặc dùng raw SQL text binding.

### 7.4 Alternative: Raw SQL Binding cho Batch

```python
from sqlalchemy import text

raw_sql = text("""
    INSERT INTO dim_node (node_key, node_source_id, node_type, is_snapped, geometry, record_timestamp)
    VALUES (:node_key, :node_source_id, :node_type, :is_snapped, 
            ST_GeomFromText(:geometry_wkt, 4326), :record_timestamp)
    ON CONFLICT (node_key) DO UPDATE SET
        node_type = EXCLUDED.node_type,
        is_snapped = EXCLUDED.is_snapped,
        record_timestamp = EXCLUDED.record_timestamp
""")

session.execute(raw_sql, records)  # records chứa "geometry_wkt" key
```

### 7.5 Column Mapping

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `node_key` | `node_key` | `BIGINT` | OSM `osmid` trực tiếp |
| `node_source_id` | `node_source_id` | `BIGINT` | OSM `osmid` |
| `node_type` | `node_type` | `VARCHAR(30)` | `derive_node_type(highway, street_count)` |
| `is_snapped` | `is_snapped` | `BOOLEAN` | `False` (default) |
| `geometry_wkt` | `geometry` (via ST_GeomFromText) | `GEOMETRY(Point,4326)` | `f"POINT({x} {y})"` |
| `record_timestamp` | `record_timestamp` | `TIMESTAMP` | `datetime.utcnow()` |

---

## 8. Bảng Dimension: `dim_segment`

### 8.1 DDL Reference

```sql
CREATE TABLE dim_segment (
    segment_key         BIGINT PRIMARY KEY,
    from_node_key       BIGINT REFERENCES dim_node(node_key),
    to_node_key         BIGINT REFERENCES dim_node(node_key),
    way_key             BIGINT REFERENCES dim_way(way_key),
    location_key        BIGINT REFERENCES dim_location(location_key),
    segment_id_source   BIGINT,
    length_m            DECIMAL(10,2),
    geometry_center     GEOMETRY(Point, 4326),
    geometry_linestring GEOMETRY(LineString, 4326),
    is_one_way          BOOLEAN DEFAULT FALSE,
    record_timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 8.2 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(segment_key)` – Single PK |
| **On Conflict Action** | `DO UPDATE` |
| **Update Columns** | `length_m`, `is_one_way`, `record_timestamp` |
| **Batch Size** | 500 |

### 8.3 PostGIS – Hai geometry columns

```python
# dim_segment có 2 geometry columns:
# 1. geometry_center     → Point (centroid of linestring)
# 2. geometry_linestring → LineString (full edge shape)

# Raw SQL binding pattern:
raw_sql = text("""
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
""")
```

### 8.4 Column Mapping

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `segment_key` | `segment_key` | `BIGINT` | `generate_segment_key(from_node, to_node, osmid)` |
| `from_node_key` | `from_node_key` | `BIGINT` | OSM edge `u` (FK → dim_node) |
| `to_node_key` | `to_node_key` | `BIGINT` | OSM edge `v` (FK → dim_node) |
| `way_key` | `way_key` | `BIGINT` | OSM `osmid` (FK → dim_way) |
| `location_key` | `location_key` | `BIGINT` | Spatial join → dim_location (nullable initially) |
| `segment_id_source` | `segment_id_source` | `BIGINT` | OSM Way ID |
| `length_m` | `length_m` | `DECIMAL(10,2)` | OSMnx `length` (mét) |
| `center_wkt` | `geometry_center` (via ST_GeomFromText) | `GEOMETRY(Point)` | `coords_to_wkt_point(centroid_lon, centroid_lat)` |
| `linestring_wkt` | `geometry_linestring` (via ST_GeomFromText) | `GEOMETRY(LineString)` | WKT từ OSMnx geometry |
| `is_one_way` | `is_one_way` | `BOOLEAN` | OSM `oneway` |
| `record_timestamp` | `record_timestamp` | `TIMESTAMP` | `datetime.utcnow()` |

> **FK Constraint:** `from_node_key` và `to_node_key` phải có trong `dim_node` trước. → Insert `dim_node` TRƯỚC `dim_segment`.

---

## 9. Bảng Dimension: `dim_way`

### 9.1 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(way_key)` – Single PK |
| **On Conflict Action** | `DO UPDATE` |
| **Update Columns** | `total_length_m`, `segment_count`, `record_timestamp` |
| **Batch Size** | 500 |

### 9.2 Column Mapping

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `way_key` | `way_key` | `BIGINT` | OSM `osmid` (Way ID) |
| `road_key` | `road_key` | `BIGINT` | `generate_road_key(name)` (FK → dim_road) |
| `total_length_m` | `total_length_m` | `DECIMAL(10,2)` | SUM(length) per way |
| `direction` | `direction` | `VARCHAR(20)` | `"Forward"` if oneway else `"Both"` |
| `segment_count` | `segment_count` | `INT` | COUNT edges per way |
| `default_lane_count` | `default_lane_count` | `SMALLINT` | `parse_lanes(lanes, highway)` |
| `design_capacity` | `design_capacity` | `INT` | `lane_count * 2000` |
| `default_speed_limit` | `default_speed_limit` | `SMALLINT` | `parse_maxspeed(maxspeed, highway)` |
| `tomtom_frc` | `tomtom_frc` | `SMALLINT` | `get_frc(highway)` |
| `osm_highway_type` | `osm_highway_type` | `VARCHAR(30)` | OSM `highway` trực tiếp |
| `record_timestamp` | `record_timestamp` | `TIMESTAMP` | `datetime.utcnow()` |

> **FK Constraint:** `road_key` phải có trong `dim_road` trước. → Insert `dim_road` TRƯỚC `dim_way`.

---

## 10. Bảng Dimension: `dim_road`

### 10.1 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(road_key)` – Single PK |
| **On Conflict Action** | `DO UPDATE` |
| **Update Columns** | `total_length_m`, `record_timestamp` |
| **Batch Size** | 200 |

### 10.2 Column Mapping

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `road_key` | `road_key` | `BIGINT` | `generate_road_key(name)` |
| `name` | `name` | `VARCHAR(100)` | OSM `name` (null → `"N/A"`) |
| `total_length_m` | `total_length_m` | `DECIMAL(10,2)` | SUM(length) group by name |
| `record_timestamp` | `record_timestamp` | `TIMESTAMP` | `datetime.utcnow()` |

---

## 11. Bảng Dimension: `dim_location`

### 11.1 UPSERT Strategy

| Thuộc tính | Giá trị |
|:-----------|:--------|
| **Conflict Target** | `(location_key)` – Single PK |
| **On Conflict Action** | `DO NOTHING` (admin boundaries don't change) |
| **Batch Size** | 100 |

### 11.2 Column Mapping

| Dict Key | DB Column | DB Type | Source |
|:---------|:----------|:--------|:-------|
| `location_key` | `location_key` | `BIGINT` | Hash from ward+district |
| `ward` | `ward` | `VARCHAR(100)` | Reverse geocode / admin boundary |
| `district` | `district` | `VARCHAR(100)` | Reverse geocode |
| `city` | `city` | `VARCHAR(100)` | `"Hồ Chí Minh"` (default) |
| `record_timestamp` | `record_timestamp` | `TIMESTAMP` | `datetime.utcnow()` |

---

## 12. Bảng Dimension: Thời gian

### 12.1 `dim_month_year`

| Conflict Target | Action | Batch Size |
|:---------------|:-------|:-----------|
| `(month_year_key)` | `DO NOTHING` | 100 |

**Records:** 48 rows (2024–2027 × 12 tháng), sinh từ code (không có Extractor).

### 12.2 `dim_date`

| Conflict Target | Action | Batch Size |
|:---------------|:-------|:-----------|
| `(date_key)` | `DO NOTHING` | 500 |

**Records:** ~1461 rows (4 năm × ~365 ngày), sinh từ code.

### 12.3 `dim_time_of_day`

| Conflict Target | Action | Batch Size |
|:---------------|:-------|:-----------|
| `(time_key)` | `DO NOTHING` | 500 |

**Records:** 1440 rows (0–1439 phút), sinh từ code.

### 12.4 `dim_shift`

| Conflict Target | Action | Batch Size |
|:---------------|:-------|:-----------|
| `(shift_key)` | `DO NOTHING` | 10 |

**Records:** 4 rows (SANG, TRUA, CHIEU, DEM), hardcode.

| shift_key | shift_code | start_minute | end_minute | is_business_shift |
|:---------:|:-----------|:------------|:-----------|:----------------:|
| 1 | SANG | 360 | 720 | True |
| 2 | TRUA | 720 | 840 | True |
| 3 | CHIEU | 840 | 1320 | True |
| 4 | DEM | 1320 | 360 | False |

---

## 13. Bảng Dimension: `dim_holiday` + `bridge_date_holiday`

### 13.1 `dim_holiday`

| Conflict Target | Action | Batch Size |
|:---------------|:-------|:-----------|
| `(holiday_key)` | `DO NOTHING` | 50 |

### 13.2 `bridge_date_holiday`

| Conflict Target | Action | Batch Size |
|:---------------|:-------|:-----------|
| `(date_key, holiday_key)` | `DO NOTHING` | 100 |

---

## 14. FK Insert Order – Thứ tự nạp bắt buộc

> **QUAN TRỌNG:** Nếu sai thứ tự → `IntegrityError: insert or update on table "..." violates foreign key constraint`.

### 14.1 Domain 1: Static Dims

```
① dim_month_year     (không FK)
② dim_shift          (không FK)
③ dim_date           (FK → dim_month_year)
④ dim_time_of_day    (FK → dim_shift)
⑤ dim_holiday        (không FK)
⑥ bridge_date_holiday (FK → dim_date, dim_holiday)
```

### 14.2 Domain 2: Spatial Net

```
① dim_location       (không FK)
② dim_node           (không FK)
③ dim_road           (không FK)
④ dim_way            (FK → dim_road)
⑤ dim_segment        (FK → dim_node ×2, dim_way, dim_location)
```

> **Thứ tự nghiêm ngặt:** dim_node TRƯỚC dim_segment (vì from_node_key, to_node_key).
> dim_road TRƯỚC dim_way (vì road_key FK).
> dim_way TRƯỚC dim_segment (vì way_key FK).

### 14.3 Domain 3: Real-time

```
① dim_weather        (không FK, chạy trước traffic)
② fact_traffic_flow  (FK → dim_segment, dim_time_of_day, dim_date, dim_weather)
③ fact_incident      (FK → dim_segment, dim_time_of_day, dim_date, dim_location)
```

> **Pre-condition:** Domain 1 (dim_date, dim_time_of_day) và Domain 2 (dim_segment) PHẢI đã chạy xong trước Domain 3.

### 14.4 Thứ tự chạy pipeline lần đầu (tổng hợp)

```
╔═══════════════════════════════════════════════════════════╗
║  Phase 1: Static Dims (run-static)                         ║
║    dim_month_year → dim_shift → dim_date →                 ║
║    dim_time_of_day → dim_holiday → bridge_date_holiday     ║
╠═══════════════════════════════════════════════════════════╣
║  Phase 2: Spatial Net (run-spatial)                        ║
║    dim_location → dim_node → dim_road →                    ║
║    dim_way → dim_segment                                   ║
╠═══════════════════════════════════════════════════════════╣
║  Phase 3: Real-time (run-realtime, cron 15p)               ║
║    dim_weather → fact_traffic_flow → fact_incident          ║
╠═══════════════════════════════════════════════════════════╣
║  Phase 4: Batch (run-batch, nightly)                       ║
║    fact_corridor_performance                                ║
╚═══════════════════════════════════════════════════════════╝
```

---

## 15. Batch Performance Rules

### 15.1 Batch Size theo bảng

| Bảng | Batch Size | Lý do |
|:-----|:-----------|:------|
| `fact_traffic_flow` | 500 | High volume, partitioned, UPSERT |
| `fact_incident` | 500 | Medium volume, partitioned |
| `fact_event` | 100 | Low volume, Phase 2 |
| `dim_weather` | 50 | Rất ít records (max ~50 unique) |
| `dim_node` | 1000 | ~987 nodes Quận 1, 1 batch |
| `dim_segment` | 500 | ~2081 segments, 4-5 batches |
| `dim_way` | 500 | ~200 ways, 1 batch |
| `dim_road` | 200 | ~60 roads, 1 batch |
| `dim_location` | 100 | ~20 phường Quận 1 |
| `dim_date` | 500 | ~1461 rows, 3 batches |
| `dim_time_of_day` | 500 | 1440 rows, 3 batches |
| `dim_month_year` | 100 | 48 rows, 1 batch |
| `dim_shift` | 10 | 4 rows, 1 batch |

### 15.2 Benchmark mục tiêu

| Thao tác | Mục tiêu | Ghi chú |
|:---------|:---------|:--------|
| 1 batch 500 rows UPSERT fact | < 500ms | Trên local Docker |
| Full run-static | < 5s | ~3000 rows tổng |
| Full run-spatial | < 30s | ~3300 rows + PostGIS |
| 1 cycle run-realtime | < 60s | API calls + transform + load |

### 15.3 Connection Pool Settings

```python
# Từ spec_1, core/database.py:
engine = create_engine(
    database_url,
    pool_size=5,           # 4 domain pipelines + 1 spare
    max_overflow=10,
    pool_pre_ping=True,    # Check connection health
    pool_recycle=1800,     # 30min recycle
)
```

---

## 16. Error Handling & Transaction Strategy

### 16.1 Transaction per Batch

```python
# Mỗi batch là 1 transaction:
for i in range(0, len(records), batch_size):
    batch = records[i : i + batch_size]
    try:
        session.execute(stmt, batch)
        session.commit()            # Commit sau mỗi batch
    except IntegrityError as e:
        session.rollback()          # Rollback batch hiện tại
        logger.error(f"IntegrityError batch {i//batch_size}: {e}")
        raise DatabaseLoadError(str(e))
    except OperationalError as e:
        session.rollback()
        logger.error(f"OperationalError batch {i//batch_size}: {e}")
        raise DatabaseLoadError(str(e))
```

### 16.2 Exception Hierarchy (tham chiếu spec_1)

```
PipelineError (Exception)
├── DataExtractionError      ← API call thất bại
├── DataValidationError      ← Pydantic schema reject
└── DatabaseLoadError        ← INSERT/UPSERT lỗi
```

### 16.3 Rollback Rules

| Tình huống | Hành vi |
|:-----------|:--------|
| `IntegrityError` (FK violation, unique violation) | Rollback batch hiện tại, raise `DatabaseLoadError` |
| `OperationalError` (connection lost) | Rollback, raise `DatabaseLoadError` |
| `DataError` (value too large for column) | Rollback, raise `DatabaseLoadError` |
| Batch N-1 thành công, batch N thất bại | Batch 0..N-1 đã commit (persisted), batch N rollback |

### 16.4 Logging Points (trong Loader)

```python
# Bắt buộc log theo 10 điểm trong spec_2:
logger.info(f"[LOAD_START] table={table_name} total_records={len(records)}")
# ... mỗi batch:
logger.info(f"[LOAD_BATCH] table={table_name} batch={i//batch_size} size={len(batch)}")
# ... khi hoàn thành:
logger.info(f"[LOAD_END] table={table_name} total_upserted={total} duration={elapsed}s")
# ... khi lỗi:
logger.error(f"[LOAD_ERROR] table={table_name} batch={i//batch_size} error={str(e)}")
```

---

## 17. PostGIS Geometry Patterns

### 17.1 Tổng hợp cách xử lý geometry cho từng bảng

| Bảng | Cột | Geometry Type | SRID | Cách ghi |
|:-----|:----|:-------------|:----:|:---------|
| `dim_node` | `geometry` | `Point` | 4326 | `ST_GeomFromText('POINT(lon lat)', 4326)` |
| `dim_segment` | `geometry_center` | `Point` | 4326 | `ST_GeomFromText('POINT(lon lat)', 4326)` |
| `dim_segment` | `geometry_linestring` | `LineString` | 4326 | `ST_GeomFromText('LINESTRING(...)', 4326)` |
| `fact_incident` | `geometry` | `Point` | 4326 | `ST_GeomFromText('POINT(lon lat)', 4326)` |

### 17.2 WKT Format Rules

```
POINT:      "POINT(106.6958961 10.7926816)"
            → POINT(longitude latitude) – thứ tự XY

LINESTRING: "LINESTRING(106.695 10.792, 106.696 10.793, 106.697 10.794)"
            → Danh sách tọa độ (lon lat) phân cách bằng dấu phẩy
```

### 17.3 Coordinate Order Convention

| Hệ thống | Thứ tự | Ví dụ |
|:----------|:-------|:------|
| GeoJSON | `[longitude, latitude]` | `[106.7, 10.78]` |
| WKT / PostGIS | `POINT(longitude latitude)` | `POINT(106.7 10.78)` |
| OSMnx | `x=longitude, y=latitude` | `x=106.7, y=10.78` |
| Python tuple (our convention) | `(longitude, latitude)` | `(106.7, 10.78)` |
| TomTom API | `{latitude, longitude}` | **ĐẢO NGƯỢC!** → Cần swap |

> **CẨN THẬN:** TomTom coordinate dùng `{latitude, longitude}` – ngược với GeoJSON/WKT.
> Khi xử lý coordinates từ TomTom, phải swap: `(coord.longitude, coord.latitude)`.

### 17.4 SQLAlchemy + PostGIS Pattern

```python
from sqlalchemy import func, text

# Pattern 1: func.ST_GeomFromText (cho insert từng row)
geometry_col = func.ST_GeomFromText(f"POINT({lon} {lat})", 4326)

# Pattern 2: text() binding (cho batch insert)
stmt = text("""
    INSERT INTO dim_node (node_key, geometry)
    VALUES (:node_key, ST_GeomFromText(:geom_wkt, 4326))
""")
session.execute(stmt, {"node_key": 123, "geom_wkt": "POINT(106.7 10.78)"})

# Pattern 3: Centroid computation
# Nếu cần ST_Centroid trong Python, dùng shapely:
from shapely.geometry import LineString
line = LineString([(106.695, 10.792), (106.697, 10.794)])
centroid = line.centroid
wkt_center = f"POINT({centroid.x} {centroid.y})"
```

---

## Tổng hợp: UPSERT Strategy per Table

| Bảng | PK / Conflict Target | Action | Update Columns | Batch |
|:-----|:---------------------|:-------|:---------------|:-----:|
| `fact_traffic_flow` | `(traffic_flow_key, date_key)` | DO UPDATE | speed, index, delay, los, congestion, closed, quality, inserted_at | 500 |
| `fact_incident` | `(incident_key, date_key)` | DO UPDATE | severity, delay, is_active, quality, inserted_at | 500 |
| `fact_event` | `(event_id)` | DO NOTHING | – | 100 |
| `dim_weather` | `(weather_key)` | DO NOTHING | – | 50 |
| `dim_node` | `(node_key)` | DO UPDATE | node_type, is_snapped, record_timestamp | 1000 |
| `dim_segment` | `(segment_key)` | DO UPDATE | length_m, is_one_way, record_timestamp | 500 |
| `dim_way` | `(way_key)` | DO UPDATE | total_length_m, segment_count, record_timestamp | 500 |
| `dim_road` | `(road_key)` | DO UPDATE | total_length_m, record_timestamp | 200 |
| `dim_location` | `(location_key)` | DO NOTHING | – | 100 |
| `dim_month_year` | `(month_year_key)` | DO NOTHING | – | 100 |
| `dim_date` | `(date_key)` | DO NOTHING | – | 500 |
| `dim_time_of_day` | `(time_key)` | DO NOTHING | – | 500 |
| `dim_shift` | `(shift_key)` | DO NOTHING | – | 10 |
| `dim_holiday` | `(holiday_key)` | DO NOTHING | – | 50 |
| `bridge_date_holiday` | `(date_key, holiday_key)` | DO NOTHING | – | 100 |

---

> **Tham chiếu chéo:**
> - `spec_1_blueprint.md` → Vị trí file, FK insert order overview, pipeline flow
> - `spec_2_base_interface.md` → `BaseLoader` ABC, CONFLICT_KEYS/UPDATE_COLUMNS table, SQLAlchemy 2.0 rules
> - `spec_3_data_contracts.md` → Field contracts, column mapping overviews (§13)
> - `spec_4_business_logic.md` → Tất cả compute functions referenced in column mappings
> - DB Schema: `infrastructure/postgres/2_create_dims.sql`, `3_create_facts.sql`
