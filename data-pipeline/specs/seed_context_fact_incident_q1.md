# SEED CONTEXT – FACT INCIDENT (QUẬN 1, TP.HCM)

| Metadata | Giá trị |
|:--|:--|
| Phạm vi | Fact table `fact_incident` cho khu vực Quận 1 |
| Mục tiêu | Seed context để AI sinh code ETL: Pydantic Schema, Transformer, Loader |
| Múi giờ chuẩn | `Asia/Ho_Chi_Minh` |
| Tần suất ingest | 15 phút/lần |
| Chiến lược nạp | `UPSERT` idempotent |

> **CHỈ THỊ CỨNG:** AI khi sinh code ETL **BẮT BUỘC** tuân thủ tài liệu này. Mọi giả định ngoài tài liệu là **TUYỆT ĐỐI KHÔNG ĐƯỢC** áp dụng.

---

## 1) SOURCE DATA

### 1.1 Nguồn chính (BẮT BUỘC)
- **TomTom Incident Details API v5**
- Endpoint pattern:
  - `GET /traffic/services/5/incidentDetails`
  - Query chính: `bbox`, `fields`, `language`, `timeValidityFilter=present`
- JSON root: `incidents[]`

### 1.2 Nguồn bổ sung phục vụ transform (BẮT BUỘC)
- **OSM / dim_segment** để spatial join xác định `segment_key` từ geometry incident.
- **dim_location** (nếu có pipeline location mapping) để gán `location_key`.

### 1.3 Danh sách field JSON gốc cần trích xuất
| JSON Path | Kiểu nguồn | Bắt buộc | Dùng cho |
|:--|:--|:--:|:--|
| `incidents[].properties.id` | string | Có | `incident_key` |
| `incidents[].properties.iconCategory` | integer | Có | `incident_type` |
| `incidents[].properties.magnitudeOfDelay` | integer/null | Không | `severity_level` |
| `incidents[].properties.startTime` | string ISO8601 | Có | `timestamp`, `date_key`, `time_key` |
| `incidents[].properties.endTime` | string ISO8601/null | Không | `is_active` |
| `incidents[].properties.delay` | integer/null | Không | `delay_seconds` |
| `incidents[].geometry.type` | string | Có | Kiểm tra contract (ưu tiên `LineString`) |
| `incidents[].geometry.coordinates` | array[[lon,lat], ...] | Có | sinh centroid Point cho `geometry` |
| `incidents[].properties.from` | string/null | Không | metadata quality (không bắt buộc lưu) |
| `incidents[].properties.to` | string/null | Không | metadata quality (không bắt buộc lưu) |
| `incidents[].properties.length` | number/null | Không | metadata quality (không bắt buộc lưu) |

### 1.4 Ràng buộc không gian Quận 1 (BẮT BUỘC)
- Bounding box kiểm tra phạm vi:
  - `min_lon=106.663, min_lat=10.743, max_lon=106.723, max_lat=10.803`
- Incident ngoài bbox Quận 1 **BẮT BUỘC** bị loại trước bước load.

---

## 2) TARGET SCHEMA (`fact_incident`)

> DB table partition theo `date_key`; PK là composite `(incident_key, date_key)`.

### 2.1 Cột khóa (PK/FK)
| Cột | Kiểu DB | Vai trò | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `incident_key` | `BIGINT` | **PK** | No | Surrogate key deterministic từ external incident id |
| `date_key` | `INT` | **PK + FK** → `dim_date.date_key` | No | Dạng `YYYYMMDD` theo `Asia/Ho_Chi_Minh` |
| `time_key` | `INT` | **FK** → `dim_time_of_day.time_key` | No | Minute-of-day (`0..1439`) |
| `segment_key` | `BIGINT` | **FK** → `dim_segment.segment_key` | No | Segment chịu ảnh hưởng bởi incident |
| `location_key` | `BIGINT` | **FK** → `dim_location.location_key` | Yes | Có thể null nếu chưa map location |

### 2.2 Cột thời gian nghiệp vụ
| Cột | Kiểu DB | Nhóm | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `timestamp` | `TIMESTAMP` | Time | No | Thời điểm bắt đầu incident (đã chuẩn hóa timezone) |
| `inserted_at` | `TIMESTAMP` | Audit | No | Thời điểm ghi DB |

### 2.3 Cột metrics
| Cột | Kiểu DB | Nhóm | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `severity_level` | `SMALLINT` | Metric | Yes | Mức độ sự cố chuẩn hóa (0..4) |
| `delay_seconds` | `INT` | Metric | Yes | Độ trễ do sự cố (giây) |

### 2.4 Cột phân loại/flags/spatial
| Cột | Kiểu DB | Nhóm | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `incident_type` | `VARCHAR(50)` | Classifier | Yes | Loại sự cố từ `iconCategory` |
| `geometry` | `GEOMETRY(Point,4326)` | Spatial | Yes | Centroid của incident geometry |
| `is_simulated` | `BOOLEAN` | Flag | Yes | Cờ dữ liệu mô phỏng |
| `is_active` | `BOOLEAN` | Flag | Yes | Trạng thái còn hiệu lực của incident |
| `quality_flag` | `SMALLINT` | Flag | Yes | Cờ chất lượng dữ liệu |

---

## 3) TRANSFORM & BUSINESS RULES

### 3.1 Chuẩn hóa thời gian và parse key (BẮT BUỘC)
1. Parse `startTime` theo ISO8601.
2. Nếu `startTime` thiếu/không parse được: fallback `now(Asia/Ho_Chi_Minh)`.
3. Chuẩn hóa timezone về `Asia/Ho_Chi_Minh` trước khi derive key.
4. `date_key = int(ts_local.strftime("%Y%m%d"))`.
5. `time_key = ts_local.hour * 60 + ts_local.minute`.
6. `timestamp` ghi DB phải đồng nhất chuẩn timezone của pipeline (nếu lưu naive timestamp thì strip tz nhất quán).

> **TUYỆT ĐỐI** không derive `date_key/time_key` trực tiếp từ UTC nếu chưa convert về `Asia/Ho_Chi_Minh`.

### 3.2 Sinh khóa `incident_key` (BẮT BUỘC deterministic)
- Input: `incident_id = properties.id`
- Công thức:
  - `hex15 = sha256(incident_id.encode()).hexdigest()[:15]`
  - `incident_key = int(hex15, 16)`
- Fallback:
  - Nếu thiếu `id`: tạo chuỗi tạm ổn định trong batch (ví dụ `unknown_{idx}`) rồi hash cùng công thức.

### 3.3 Mapping loại sự cố (`incident_type`) từ `iconCategory`
| iconCategory | incident_type |
|:--:|:--|
| 1 | `accident` |
| 2 | `fog` |
| 3 | `dangerous_conditions` |
| 4 | `rain` |
| 5 | `ice` |
| 6 | `jam` |
| 7 | `lane_closed` |
| 8 | `road_closed` |
| 9 | `road_works` |
| 10 | `wind` |
| 11 | `flooding` |
| 14 | `broken_down_vehicle` |
| khác/null | `unknown` |

### 3.4 Chuẩn hóa mức độ sự cố (`severity_level`)
- Nguồn: `magnitudeOfDelay`
- Rule:
  - null -> `0`
  - clamp về `[0, 4]`
- Công thức chuẩn: `severity_level = max(0, min(4, magnitude))`

### 3.5 Trạng thái hiệu lực (`is_active`)
- Rule:
  - `endTime == null` -> `True`
  - parse `endTime` (timezone-aware theo Asia/Ho_Chi_Minh nếu thiếu tz)
  - `end_dt > now(Asia/Ho_Chi_Minh)` -> `True`, ngược lại `False`

### 3.6 Delay + quality flag
- `delay_seconds = properties.delay` nếu có, ngược lại `0`.
- `quality_flag` mặc định `5` (medium confidence) cho incident API nếu chưa có score chi tiết.

### 3.7 Biến đổi tọa độ không gian (BẮT BUỘC)
1. Input GeoJSON incident thường là `LineString` với thứ tự `[lon, lat]`.
2. Tính centroid:
   - `centroid_lon = mean(all lon)`
   - `centroid_lat = mean(all lat)`
3. Convert sang WKT Point: `POINT(centroid_lon centroid_lat)`.
4. Khi load DB, **BẮT BUỘC** dùng `ST_GeomFromText(wkt, 4326)`.

Fallback geometry:
- Nếu geometry rỗng/null: dùng điểm trung tâm HCM (`106.7011, 10.7764`) **CHỈ** như fallback tạm để tránh crash; record cần gắn cờ chất lượng thấp.

### 3.8 Quy tắc resolve `segment_key` (BẮT BUỘC)
- Ưu tiên map theo spatial join từ centroid incident -> segment gần nhất trong `dim_segment`.
- Nếu không resolve được segment hợp lệ:
  - **BẮT BUỘC skip record** khỏi load để tránh vi phạm FK.
  - Không được hard-code `segment_key=0` trong dữ liệu production.

---

## 4) LOADER STRATEGY (IDEMPOTENT)

### 4.1 Chiến lược nạp
- **BẮT BUỘC dùng UPSERT** (`INSERT ... ON CONFLICT DO UPDATE`).
- **TUYỆT ĐỐI KHÔNG** dùng delete-insert cho pipeline incident realtime.

### 4.2 Conflict Target (khóa xung đột)
- `CONFLICT TARGET = (incident_key, date_key)`
- Lý do: khớp composite PK của bảng partitioned.

### 4.3 Cột phải DO UPDATE
Khi xung đột, **BẮT BUỘC** cập nhật:
- `severity_level`
- `delay_seconds`
- `is_active`
- `quality_flag`
- `inserted_at`

> `incident_type`, `segment_key`, `time_key`, `timestamp` là dữ liệu định danh/định tuyến theo nguồn lần đầu; không update tràn lan trong nhánh conflict nếu chưa có rule nghiệp vụ riêng.

### 4.4 SQL/PostGIS yêu cầu bắt buộc
- Khi insert geometry:
  - `geometry = ST_GeomFromText(:geometry_wkt, 4326)`
- Không đẩy raw JSON coordinates trực tiếp vào cột geometry.

### 4.5 Batch + transaction rules
- Batch size khuyến nghị: `500` records/commit.
- Bọc `commit` trong `try/except`; lỗi DB phải `rollback` trước khi raise.
- Loader nhận input `list[dict]` thuần để dễ unit test và tái sử dụng.

---

## 5) CONTRACT OUTPUT CHO AI GENERATOR

AI sinh code phải xuất đúng 3 thành phần:
1. **Pydantic Schema**: model response TomTom Incident API (alias camelCase → snake_case).
2. **Transformer**: transform `incidents[]` -> `list[dict]` theo đúng schema mục 2.
3. **Loader**: PostgreSQL UPSERT + PostGIS geometry theo mục 4.

Nếu có mâu thuẫn giữa code cũ và tài liệu này, **BẮT BUỘC ưu tiên tài liệu seed context này** khi sinh mới ETL cho Quận 1.
