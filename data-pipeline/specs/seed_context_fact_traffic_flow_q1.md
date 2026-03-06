# SEED CONTEXT – FACT TRAFFIC FLOW (QUẬN 1, TP.HCM)

| Metadata | Giá trị |
|:--|:--|
| Phạm vi | Fact table `fact_traffic_flow` cho khu vực Quận 1 |
| Mục tiêu | Seed context để AI sinh code ETL: Pydantic Schema, Transformer, Loader |
| Múi giờ chuẩn | `Asia/Ho_Chi_Minh` |
| Tần suất ingest | 15 phút/lần |
| Chiến lược nạp | `UPSERT` idempotent |

> **CHỈ THỊ CỨNG:** AI khi sinh code ETL **BẮT BUỘC** tuân thủ tài liệu này. Mọi giả định ngoài tài liệu là **TUYỆT ĐỐI KHÔNG ĐƯỢC** áp dụng.

---

## 1) SOURCE DATA

### 1.1 Nguồn chính (BẮT BUỘC)
- **TomTom Traffic Flow API v4**
- Endpoint pattern:  
  `GET /traffic/services/4/flowSegmentData/absolute/10/json?key=...&point={lat},{lon}&unit=KMPH`
- JSON root: `flowSegmentData`

### 1.2 Nguồn bổ sung phục vụ transform (BẮT BUỘC)
- **OSM / dim_segment** (đã được ETL spatial trước đó) để lấy:
  - `segment_key`
  - `lane_count` (nếu có)
- **dim_weather** để nhận `weather_key` từ weather pipeline.

### 1.3 Danh sách field JSON gốc cần trích xuất
| JSON Path | Kiểu nguồn | Bắt buộc | Dùng cho |
|:--|:--|:--:|:--|
| `flowSegmentData.currentSpeed` | number | Có | `current_speed_kmh`, `traffic_index`, `pcu_volume` |
| `flowSegmentData.freeFlowSpeed` | number | Có | `free_flow_speed_kmh`, `traffic_index`, `pcu_volume` |
| `flowSegmentData.currentTravelTime` | integer | Có | `delay_seconds` |
| `flowSegmentData.freeFlowTravelTime` | integer | Có | `delay_seconds` |
| `flowSegmentData.confidence` | number (0..1) | Có | `quality_flag` |
| `flowSegmentData.roadClosure` | boolean | Có | `is_closed` |
| `flowSegmentData.coordinates.coordinate[]` | array[{latitude,longitude}] | Có | map-matching ra `segment_key` |
| `flowSegmentData.frc` | string | Không | metadata kiểm tra chất lượng (không bắt buộc lưu fact) |

### 1.4 Ràng buộc không gian Quận 1 (BẮT BUỘC)
- Bounding box kiểm tra phạm vi:  
  `min_lon=106.663, min_lat=10.743, max_lon=106.723, max_lat=10.803`
- Record ngoài bbox Quận 1 **BẮT BUỘC** bị loại trước bước load.

---

## 2) TARGET SCHEMA (`fact_traffic_flow`)

> DB table partition theo `date_key`; PK là composite `(traffic_flow_key, date_key)`.

### 2.1 Cột khóa (PK/FK)
| Cột | Kiểu DB | Vai trò | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `traffic_flow_key` | `BIGINT` | **PK** | No | Surrogate key deterministic từ `segment_key + date_key + time_key` |
| `date_key` | `INT` | **PK + FK** → `dim_date.date_key` | No | Dạng `YYYYMMDD` theo `Asia/Ho_Chi_Minh` |
| `segment_key` | `BIGINT` | **FK** → `dim_segment.segment_key` | No | Segment giao thông đã map từ spatial pipeline |
| `time_key` | `INT` | **FK** → `dim_time_of_day.time_key` | No | Minute-of-day (`0..1439`) |
| `weather_key` | `INT` | **FK** → `dim_weather.weather_key` | Yes | Khóa thời tiết cùng thời điểm ingest |

### 2.2 Cột thời gian nghiệp vụ
| Cột | Kiểu DB | Nhóm | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `timestamp` | `TIMESTAMP` | Time | No | Thời điểm snapshot traffic (local time chuẩn hóa trước khi derive key) |
| `inserted_at` | `TIMESTAMP` | Audit | No | Thời điểm ghi DB |

### 2.3 Cột metrics
| Cột | Kiểu DB | Nhóm | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `pcu_volume` | `DECIMAL(10,2)` | Metric | Yes | Lưu lượng quy đổi PCU (ước lượng) |
| `traffic_index` | `DECIMAL(3,2)` | Metric | Yes | Chỉ số ùn tắc chuẩn hóa [0.00..1.00] |
| `current_speed_kmh` | `DECIMAL(5,2)` | Metric | Yes | Vận tốc thực tế |
| `free_flow_speed_kmh` | `DECIMAL(5,2)` | Metric | Yes | Vận tốc thông thoáng |
| `delay_seconds` | `INT` | Metric | Yes | Độ trễ so với free-flow |
| `congestion_level` | `SMALLINT` | Metric | Yes | Thang 0..5 theo LOS |

### 2.4 Cột phân loại/flags
| Cột | Kiểu DB | Nhóm | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `los_level` | `CHAR(1)` | Classifier | Yes | Level of Service `A..F` |
| `is_closed` | `BOOLEAN` | Flag | Yes | Trạng thái đóng đường từ API |
| `quality_flag` | `SMALLINT` | Flag | Yes | Cờ chất lượng 0..9 từ confidence |

---

## 3) TRANSFORM & BUSINESS RULES

## 3.1 Chuẩn hóa thời gian và parse key (BẮT BUỘC)
1. Lấy timestamp ingest tại `Asia/Ho_Chi_Minh`.
2. `date_key = int(ts_local.strftime("%Y%m%d"))`.
3. `time_key = ts_local.hour * 60 + ts_local.minute`.
4. `timestamp` ghi xuống DB là `ts_local` đã chuẩn hóa (nếu dùng cột naive timestamp thì strip tz nhất quán).

> **TUYỆT ĐỐI** không derive key từ UTC trực tiếp.

### 3.2 Sinh khóa `traffic_flow_key` (BẮT BUỘC deterministic)
- Raw string: `f"{segment_key}_{date_key}_{time_key}"`
- Hash: `sha256(raw).hexdigest()[:15]`
- Key: `int(hex15, 16)`
- Kết quả phải ổn định giữa các lần chạy cùng input.

### 3.3 Công thức nghiệp vụ

#### A. Traffic Index
- Công thức:  
  `traffic_index = 1.0 - (current_speed / free_flow_speed)`
- Rule:
  - Nếu `free_flow_speed <= 0` → `traffic_index = 0.0`
  - Clamp về `[0.0, 1.0]`
  - Round `2` chữ số.

#### B. LOS + Congestion Level
- Mapping:
  - `traffic_index <= 0.15` → `LOS='A'`, `congestion_level=0`
  - `<= 0.30` → `B`, `1`
  - `<= 0.45` → `C`, `2`
  - `<= 0.60` → `D`, `3`
  - `<= 0.80` → `E`, `4`
  - `> 0.80` → `F`, `5`

#### C. Delay Seconds
- Công thức:  
  `delay_seconds = current_travel_time - free_flow_travel_time`
- Rule:
  - Nếu kết quả âm → ép về `0`.

#### D. PCU Volume (BPR inverse estimation)
- Input: `current_speed`, `free_flow_speed`, `lane_count`
- Hằng số:
  - `lane_capacity = 2000` (PCU/h/lane)
  - `alpha = 0.15`
  - `beta = 4.0`
- Rule chuẩn:
  1. Nếu `free_flow_speed <= 0` hoặc `lane_count <= 0` → `pcu_volume = 0.0`
  2. Nếu `current_speed <= 0` → `pcu_volume = lane_count * 2000`
  3. Nếu `current_speed >= free_flow_speed` → `pcu_volume = 0.0`
  4. `capacity = lane_count * 2000`
  5. `time_ratio = free_flow_speed / current_speed`
  6. `excess = (time_ratio - 1.0) / 0.15`
  7. Nếu `excess <= 0` → `pcu_volume = 0.0`
  8. `v_c_ratio = excess ** (1 / 4.0)`
  9. `pcu_volume = round(min(capacity * v_c_ratio, capacity * 1.5), 2)`

#### E. Quality Flag
- Công thức: `quality_flag = round(clamp(confidence,0,1) * 9)`
- Fallback:
  - Nếu `confidence` thiếu/null → mặc định `1`.

### 3.4 Fallback rules tổng quát (BẮT BUỘC)
- `lane_count` thiếu từ `dim_segment` → default `2`.
- Không resolve được `segment_key` → **BẮT BUỘC skip record**, không được ép `segment_key=0` để load.
- Sai schema Pydantic (`ValidationError`) → skip record + log cảnh báo.
- `roadClosure` thiếu → default `False`.

### 3.5 Biến đổi tọa độ không gian / map-matching
- Thứ tự ưu tiên resolve `segment_key`:
  1. **Index-based mapping** (response thứ `i` map với segment thứ `i`) – ưu tiên cao nhất.
  2. Fallback theo tọa độ đầu tiên `coordinate[0]` (round 6 chữ số) tra trong `segment_key_map`.
  3. Nếu vẫn không khớp: nearest-segment search (nếu có GeoDataFrame sẵn trong pipeline).
- Toàn bộ tọa độ đầu vào **BẮT BUỘC** theo WGS84 (`lat/lon`).

---

## 4) LOADER STRATEGY (IDEMPOTENT)

### 4.1 Chiến lược nạp
- **BẮT BUỘC dùng UPSERT** (`INSERT ... ON CONFLICT DO UPDATE`).
- **TUYỆT ĐỐI KHÔNG** dùng `delete-insert` cho `fact_traffic_flow` realtime vì gây mất tính idempotent và tăng lock/IO.

### 4.2 Conflict Target (khóa xung đột)
- `CONFLICT TARGET = (traffic_flow_key, date_key)`
- Lý do: khớp composite PK của bảng partitioned.

### 4.3 Cột phải DO UPDATE
Khi xung đột, **BẮT BUỘC** cập nhật:
- `current_speed_kmh`
- `free_flow_speed_kmh`
- `pcu_volume`
- `traffic_index`
- `delay_seconds`
- `los_level`
- `congestion_level`
- `is_closed`
- `quality_flag`
- `inserted_at` (set thời điểm mới)

> Không update các cột định danh (`traffic_flow_key`, `segment_key`, `date_key`, `time_key`) trong nhánh conflict.

### 4.4 Batch + transaction rules
- Batch size khuyến nghị: `500` records/commit.
- Bọc `commit` trong `try/except`; lỗi DB phải `rollback` trước khi raise.
- Loader function nhận input `list[dict]` thuần để dễ test và tái sử dụng.

---

## 5) CONTRACT OUTPUT CHO AI GENERATOR

AI sinh code phải xuất đúng 3 thành phần:
1. **Pydantic Schema**: model response TomTom (alias camelCase → snake_case).
2. **Transformer**: hàm pure hoặc class transform trả `list[dict]` theo đúng cột mục 2.
3. **Loader**: PostgreSQL UPSERT với conflict target + update columns ở mục 4.

Nếu có mâu thuẫn giữa code cũ và tài liệu này, **BẮT BUỘC ưu tiên tài liệu seed context này** khi sinh mới ETL cho Quận 1.
