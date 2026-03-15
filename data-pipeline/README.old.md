# Data Pipeline - Unified README

README nay duoc tong hop tu toan bo cac file Markdown trong `data-pipeline/` thanh mot tai lieu duy nhat.

## 1. Muc tieu va pham vi

- Muc tieu: thay the tai lieu roi rac bang mot tai lieu trung tam de dev, ops, data va AI agent cung tra cuu.
- Pham vi tong hop: 30 file `.md` trong `data-pipeline/` (bao gom `specs/` va `tests/results/`).
- Nguon schema bang: `infrastructure/postgres/1_init_extensions.sql`, `2_create_dims.sql`, `3_create_facts.sql`, `4_indexes.sql` va migration lien quan.
- Luu y: `backend/prisma/schema.prisma` hien chi co bang `User`; schema DW day du duoc lay tu `infrastructure/postgres/*.sql`.

## 2. Tong quan kien truc ETL

```text
Phase static
  dim_month_year -> dim_shift -> dim_date -> dim_time_of_day
  dim_holiday -> bridge_date_holiday

Phase spatial
  dim_location -> dim_node -> dim_road -> dim_way -> dim_segment
  dim_corridor -> bridge_corridor_segment

Phase realtime (15 phut)
  dim_weather -> fact_traffic_flow -> fact_incident

Phase batch/analytics
  fact_event
  fact_traffic_risk_prediction
  fact_simulation_scenario
  fact_corridor_performance
```

## 3. Tom tat chat loc theo nhom tai lieu

### 3.1 Nhom implementation notes

- `docs/implementation/CENTRAL_DISTRICTS_EXPANSION.md`: mo rong pham vi ETL cho cum quan trung tam, cap nhat bbox, pipeline anh huong, lenh chay va checklist validation.
- `docs/implementation/CLEAN_CODE_RESTRUCTURING.md`: bao cao tai cau truc clean architecture, sap xep module, chuan hoa import va migration script.
- `docs/implementation/CORRIDOR_IMPLEMENTATION_GUIDE.md`: huong dan day du corridor pipeline, transaction safety, schema yeu cau cho `dim_corridor` va `bridge_corridor_segment`.
- `docs/implementation/FIX_LOCATION_GEOMETRY_SUMMARY.md`: tong ket sua loi polygon location va map segment-location, ket qua cai thien va quy trinh cache.
- `docs/implementation/OSM_PERFORMANCE.md`: huong dan toi uu OSM pipeline (cache, district mode, benchmark, troubleshooting).

### 3.2 Nhom specs

- `spec_1_blueprint.md`: master blueprint module, cau truc thu muc, dependency graph, runtime constraints.
- `spec_2_base_interface.md`: tieu chuan ky thuat, base interfaces (`Extractor/Transformer/Loader`), coding conventions.
- `spec_3_data_contracts.md`: data contract cho TomTom/Weather/OSM, field map, schema rules.
- `spec_4_business_logic.md`: cong thuc business logic (traffic index, LOS, congestion, weather severity, fallback rules).
- `spec_5_target_mapping.md`: mapping cot sang DB, upsert pattern, thu tu nap, geometry handling.
- `spec_dim_corridor_bridge.md`: spec rieng cho corridor va bridge corridor-segment.
- `seed_context_fact_traffic_flow_q1.md`: source, target schema, transform va idempotent load cho `fact_traffic_flow` (Q1).
- `seed_context_fact_incident_q1.md`: source, target schema, transform spatial/time va idempotent load cho `fact_incident` (Q1).
- `seed_context_fact_corridor_performance_q1.md`: aggregate rules va schema cho `fact_corridor_performance` (Q1).
- `seeds/seed_dim_shift.md`: quy tac seed static cho `dim_shift`.
- `seeds/seed_dim_weather.md`: quy tac mapping weather va severity.
- `seeds/seed_part1_traffic_flow.md`: mapping va transform traffic flow.
- `seeds/seed_part2_spatial.md`: mapping spatial (`dim_node`, `dim_segment`, `dim_way`) va fallback.
- `seeds/seed_part3_loaders.md`: transform incident/weather va upsert loaders.

### 3.3 Nhom reports (tests/results)

- `COMPREHENSIVE_ANALYSIS_REPORT.md`: bao cao tong hop data source, quality, do phu, thiet ke schema de xuat, gap/risk va roadmap.
- `FINAL_DATA_SOURCES_REPORT.md`: tong ket nguon OSM, TomTom, Weather, SerpAPI va mapping vao DW.
- `OPEN_WEATHER_MAP_REPORT.md`: ket qua test current weather va forecast tu OpenWeather.
- `OSM_ARTERIAL_ROADS_REPORT.md`: danh sach/phan loai truc duong chinh cho corridor design.
- `OSM_COVERAGE_REPORT.md`: danh gia do day du thuoc tinh OSM (lanes, highway, ...).
- `OSM_DATA_REPORT.md`: thong ke node/edge/geometry OSM khu vuc thu nghiem.
- `SERPAPI_CONTEXT_REPORT.md`: du lieu boi canh (events, local, news, trends) cho feature mo rong.
- `TOMTOM_INCIDENT_ANALYZE_REPORT.md`: phan tich incident severity, metrics va sample payload.
- `TOMTOM_TECHNICAL_REPORT.md`: ket qua test endpoint TomTom (search, flow, incidents, routing, snap-to-roads).
- `Traffic_Signals_Report.md`: thong ke node den tin hieu de xac dinh `node_type=signalized`.

## 4. Danh muc day du tat ca file Markdown da duoc hop nhat

1. `data-pipeline/docs/implementation/CENTRAL_DISTRICTS_EXPANSION.md`
2. `data-pipeline/docs/implementation/CLEAN_CODE_RESTRUCTURING.md`
3. `data-pipeline/docs/implementation/CORRIDOR_IMPLEMENTATION_GUIDE.md`
4. `data-pipeline/docs/implementation/FIX_LOCATION_GEOMETRY_SUMMARY.md`
5. `data-pipeline/docs/implementation/OSM_PERFORMANCE.md`
6. `data-pipeline/README.md` (file hien tai)
7. `data-pipeline/specs/seed_context_fact_corridor_performance_q1.md`
8. `data-pipeline/specs/seed_context_fact_incident_q1.md`
9. `data-pipeline/specs/seed_context_fact_traffic_flow_q1.md`
10. `data-pipeline/specs/seeds/seed_dim_shift.md`
11. `data-pipeline/specs/seeds/seed_dim_weather.md`
12. `data-pipeline/specs/seeds/seed_part1_traffic_flow.md`
13. `data-pipeline/specs/seeds/seed_part2_spatial.md`
14. `data-pipeline/specs/seeds/seed_part3_loaders.md`
15. `data-pipeline/specs/spec_1_blueprint.md`
16. `data-pipeline/specs/spec_2_base_interface.md`
17. `data-pipeline/specs/spec_3_data_contracts.md`
18. `data-pipeline/specs/spec_4_business_logic.md`
19. `data-pipeline/specs/spec_5_target_mapping.md`
20. `data-pipeline/specs/spec_dim_corridor_bridge.md`
21. `data-pipeline/tests/results/COMPREHENSIVE_ANALYSIS_REPORT.md`
22. `data-pipeline/tests/results/FINAL_DATA_SOURCES_REPORT.md`
23. `data-pipeline/tests/results/OPEN_WEATHER_MAP_REPORT.md`
24. `data-pipeline/tests/results/OSM_ARTERIAL_ROADS_REPORT.md`
25. `data-pipeline/tests/results/OSM_COVERAGE_REPORT.md`
26. `data-pipeline/tests/results/OSM_DATA_REPORT.md`
27. `data-pipeline/tests/results/SERPAPI_CONTEXT_REPORT.md`
28. `data-pipeline/tests/results/TOMTOM_INCIDENT_ANALYZE_REPORT.md`
29. `data-pipeline/tests/results/TOMTOM_TECHNICAL_REPORT.md`
30. `data-pipeline/tests/results/Traffic_Signals_Report.md`

## 5. Toan bo schema cac bang

Nguon schema: `infrastructure/postgres/2_create_dims.sql`, `infrastructure/postgres/3_create_facts.sql` + migration:

- `infrastructure/postgres/migration_update_dim_shift_schema.sql`
- `infrastructure/postgres/migration_fix_name_collation.sql`

### 5.1 Extensions va cau hinh DB

- `postgis`
- `pgrouting`
- `btree_gin`
- `pg_stat_statements`
- Timezone DB: `Asia/Ho_Chi_Minh`

### 5.2 Dimension va bridge tables

#### `dim_month_year`
- `month_year_key INT PK`
- `month_number SMALLINT NOT NULL`
- `month_name_vi VARCHAR(50)`
- `month_start_date DATE`
- `month_end_date DATE`
- `days_in_month SMALLINT`
- `quarter_number SMALLINT NOT NULL`
- `quarter_name VARCHAR(50)`
- `year SMALLINT NOT NULL`
- `days_in_year SMALLINT`
- `is_leap_year BOOLEAN`

#### `dim_date`
- `date_key INT PK`
- `month_year_key INT FK -> dim_month_year(month_year_key)`
- `full_date DATE NOT NULL`
- `day_of_week SMALLINT NOT NULL`
- `day_name_vi VARCHAR(20)`
- `iso_week SMALLINT`
- `is_weekend BOOLEAN DEFAULT FALSE`
- `is_holiday BOOLEAN DEFAULT FALSE`
- `is_end_of_month BOOLEAN DEFAULT FALSE`

#### `dim_shift` (da cap nhat migration moi)
- `shift_key INT PK`
- `shift_code VARCHAR(20)`
- `shift_name_vi VARCHAR(50)`
- `start_hour SMALLINT`
- `end_hour SMALLINT`
- `is_peak_hour BOOLEAN DEFAULT FALSE`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `dim_time_of_day`
- `time_key INT PK`
- `default_shift_key INT FK -> dim_shift(shift_key)`
- `hhmm SMALLINT`
- `bucket_5min_key SMALLINT`
- `bucket_15min_key SMALLINT`
- `bucket_60min_key SMALLINT`
- `is_business_hours BOOLEAN DEFAULT FALSE`

#### `dim_holiday`
- `holiday_key INT PK`
- `holiday_name_vi VARCHAR(255)`
- `duration_days SMALLINT`
- `is_public_holiday BOOLEAN DEFAULT FALSE`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `bridge_date_holiday`
- `date_key INT FK -> dim_date(date_key)`
- `holiday_key INT FK -> dim_holiday(holiday_key)`
- `PK(date_key, holiday_key)`

#### `dim_weather` (name da fix collation)
- `weather_key INT PK`
- `weather_id INT`
- `name VARCHAR(100) COLLATE "en_US.utf8"`
- `main_category VARCHAR(50)`
- `severity_level SMALLINT`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `dim_location`
- `location_key BIGINT PK`
- `ward VARCHAR(100)`
- `district VARCHAR(100)`
- `city VARCHAR(100) DEFAULT 'Hồ Chí Minh'`
- `geometry_polygon GEOMETRY(Polygon, 4326)`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `dim_road`
- `road_key BIGINT PK`
- `name VARCHAR(100) NOT NULL`
- `total_length_m DECIMAL(10,2)`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `dim_way`
- `way_key BIGINT PK`
- `road_key BIGINT FK -> dim_road(road_key)`
- `total_length_m DECIMAL(10,2)`
- `direction VARCHAR(20)`
- `segment_count INT`
- `default_lane_count SMALLINT`
- `design_capacity INT`
- `default_speed_limit SMALLINT`
- `tomtom_frc SMALLINT`
- `osm_highway_type VARCHAR(30)`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `dim_node`
- `node_key BIGINT PK`
- `node_source_id BIGINT`
- `is_snapped BOOLEAN DEFAULT FALSE`
- `node_type VARCHAR(30)`
- `geometry GEOMETRY(Point, 4326)`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `dim_segment`
- `segment_key BIGINT PK`
- `from_node_key BIGINT FK -> dim_node(node_key)`
- `to_node_key BIGINT FK -> dim_node(node_key)`
- `way_key BIGINT FK -> dim_way(way_key)`
- `location_key BIGINT FK -> dim_location(location_key)`
- `segment_id_source BIGINT`
- `length_m DECIMAL(10,2)`
- `geometry_center GEOMETRY(Point, 4326)`
- `geometry_linestring GEOMETRY(LineString, 4326)`
- `is_one_way BOOLEAN DEFAULT FALSE`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `dim_corridor`
- `corridor_key BIGINT PK`
- `corridor_name VARCHAR(255) NOT NULL`
- `importance_level SMALLINT`
- `target_avg_speed DECIMAL(5,2)`
- `total_length_m DECIMAL(12,2)`
- `direction VARCHAR(10)`
- `record_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

#### `bridge_corridor_segment`
- `corridor_key BIGINT FK -> dim_corridor(corridor_key)`
- `segment_key BIGINT FK -> dim_segment(segment_key)`
- `sequence_order INT NOT NULL`
- `PK(corridor_key, segment_key)`

### 5.3 Fact tables

#### `fact_traffic_flow` (partition theo `date_key` theo thang)
- `traffic_flow_key BIGINT NOT NULL`
- `segment_key BIGINT NOT NULL FK -> dim_segment(segment_key)`
- `time_key INT NOT NULL FK -> dim_time_of_day(time_key)`
- `date_key INT NOT NULL FK -> dim_date(date_key)`
- `weather_key INT FK -> dim_weather(weather_key)`
- `timestamp TIMESTAMP NOT NULL`
- `pcu_volume DECIMAL(10,2)`
- `traffic_index DECIMAL(3,2)`
- `current_speed_kmh DECIMAL(5,2)`
- `free_flow_speed_kmh DECIMAL(5,2)`
- `delay_seconds INT`
- `los_level CHAR(1)`
- `congestion_level SMALLINT`
- `is_closed BOOLEAN DEFAULT FALSE`
- `inserted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `quality_flag SMALLINT DEFAULT 1`
- `PK(traffic_flow_key, date_key)`

#### `fact_incident` (partition theo `date_key` theo thang)
- `incident_key BIGINT NOT NULL`
- `time_key INT NOT NULL FK -> dim_time_of_day(time_key)`
- `date_key INT NOT NULL FK -> dim_date(date_key)`
- `segment_key BIGINT NOT NULL FK -> dim_segment(segment_key)`
- `location_key BIGINT FK -> dim_location(location_key)`
- `incident_type VARCHAR(50)`
- `timestamp TIMESTAMP NOT NULL`
- `severity_level SMALLINT`
- `delay_seconds INT`
- `geometry GEOMETRY(Point, 4326)`
- `is_simulated BOOLEAN DEFAULT FALSE`
- `is_active BOOLEAN DEFAULT TRUE`
- `inserted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `quality_flag SMALLINT DEFAULT 1`
- `PK(incident_key, date_key)`

#### `fact_event`
- `event_id BIGINT PK`
- `start_time_key INT FK -> dim_time_of_day(time_key)`
- `end_time_key INT FK -> dim_time_of_day(time_key)`
- `date_key INT NOT NULL FK -> dim_date(date_key)`
- `location_key BIGINT FK -> dim_location(location_key)`
- `event_type VARCHAR(50)`
- `attendance_scale INT`
- `impact_radius_m INT`
- `event_title VARCHAR(255)`
- `inserted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `quality_flag SMALLINT DEFAULT 1`

#### `fact_traffic_risk_prediction` (partition theo `date_key` theo thang)
- `prediction_key BIGINT NOT NULL`
- `segment_key BIGINT NOT NULL FK -> dim_segment(segment_key)`
- `time_key INT NOT NULL FK -> dim_time_of_day(time_key)`
- `date_key INT NOT NULL FK -> dim_date(date_key)`
- `timestamp TIMESTAMP NOT NULL`
- `horizon_minutes INT`
- `predicted_risk_score DECIMAL(3,2)`
- `confidence_level DECIMAL(3,2)`
- `model_version VARCHAR(20)`
- `inserted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `quality_flag SMALLINT DEFAULT 1`
- `PK(prediction_key, date_key)`

#### `fact_simulation_scenario`
- `simulation_key BIGINT PK`
- `time_key INT NOT NULL FK -> dim_time_of_day(time_key)`
- `date_key INT NOT NULL FK -> dim_date(date_key)`
- `segment_key BIGINT NOT NULL FK -> dim_segment(segment_key)`
- `incident_key BIGINT` (khong FK cung)
- `scenario_id VARCHAR(50)`
- `timestamp TIMESTAMP NOT NULL`
- `sim_avg_speed DECIMAL(5,2)`
- `sim_travel_time INT`
- `improvement_pct DECIMAL(5,2)`
- `is_optimal_plan BOOLEAN DEFAULT FALSE`
- `inserted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `quality_flag SMALLINT DEFAULT 1`

#### `fact_corridor_performance`
- `corridor_perf_key BIGINT PK`
- `corridor_key BIGINT NOT NULL FK -> dim_corridor(corridor_key)`
- `time_key INT NOT NULL FK -> dim_time_of_day(time_key)`
- `date_key INT NOT NULL FK -> dim_date(date_key)`
- `bottleneck_seg_key BIGINT FK -> dim_segment(segment_key)`
- `timestamp TIMESTAMP NOT NULL`
- `avg_corridor_speed DECIMAL(5,2)`
- `total_delay_seconds INT`
- `travel_time_index DECIMAL(4,2)`
- `corridor_efficiency DECIMAL(3,2)`
- `active_incident_count INT`
- `inserted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `quality_flag SMALLINT DEFAULT 1`

### 5.4 Partition hien co

- `fact_traffic_flow`: partitions thang `202401` -> `202412`.
- `fact_incident`: partitions thang `202401` -> `202412`.
- `fact_traffic_risk_prediction`: partitions thang `202401` -> `202412`.

### 5.5 Index strategy (tom tat)

- BRIN cho cot `timestamp`, `inserted_at` tren fact tables.
- GiST cho geometry: `dim_node.geometry`, `dim_segment.geometry_center`, `dim_segment.geometry_linestring`, `fact_incident.geometry`.
- B-Tree cho FK JOIN va composite index (`segment_key`, `date_key`).
- Partial indexes cho high congestion, bad LOS, severe incidents.

## 6. Quy trinh chay ETL de xuat

### 6.1 Local

```bash
cd data-pipeline
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

python src/main.py db-check
python src/main.py run --phase static
python src/main.py run --phase spatial
python src/main.py run --phase realtime
python src/main.py run --phase batch
```

### 6.2 Docker

```bash
docker compose up --build
docker compose exec data-pipeline python src/main.py db-check
docker compose exec data-pipeline python src/main.py run-all
```

## 7. Van hanh va troubleshooting nhanh

- DB fail: kiem tra bien env va trang thai postgres.
- Loi PostGIS: dam bao da chay `infrastructure/postgres/1_init_extensions.sql`.
- OSM cham: dung cache, thu nho bbox de test nhanh (`docs/implementation/OSM_PERFORMANCE.md`).
- Ty le map location thap: tham khao `docs/implementation/FIX_LOCATION_GEOMETRY_SUMMARY.md`.

## 8. Ghi chu

- Day la README tong hop va la diem vao duy nhat cho `data-pipeline`.
- Khi cap nhat tai lieu chi tiet moi, can dong bo file nay de giu vai tro single source of truth.
