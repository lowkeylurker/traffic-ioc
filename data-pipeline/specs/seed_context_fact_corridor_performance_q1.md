# SEED CONTEXT – FACT CORRIDOR PERFORMANCE (QUẬN 1, TP.HCM)

| Metadata | Giá trị |
|:--|:--|
| Phạm vi | Bảng `fact_corridor_performance` cho tập corridor thuộc khu vực Quận 1 |
| Mục tiêu | Seed context để AI sinh code ETL: Transformer aggregate + Loader UPSERT |
| Lịch chạy | Batch nightly (sau realtime pipelines) |
| Múi giờ nghiệp vụ | `Asia/Ho_Chi_Minh` cho `date_key/time_key` |
| Chiến lược nạp | `UPSERT` idempotent |

> **CHỈ THỊ CỨNG:** AI khi sinh code ETL **BẮT BUỘC** tuân thủ tài liệu này. Mọi giả định ngoài tài liệu là **TUYỆT ĐỐI KHÔNG ĐƯỢC** áp dụng.

---

## 1) SOURCE DATA

### 1.1 Nguồn dữ liệu đầu vào (BẮT BUỘC)
`fact_corridor_performance` là bảng aggregate nội bộ, **không** lấy trực tiếp từ API ngoài.

Nguồn bắt buộc:
1. `fact_traffic_flow` (metric tốc độ, delay theo segment-time)
2. `bridge_corridor_segment` (map segment -> corridor)
3. `fact_incident` (đếm sự cố active theo corridor)
4. `dim_corridor` (master corridor)
5. `dim_segment` (để xác định corridor thuộc Quận 1 theo geometry/location)

### 1.2 Trường nguồn cần trích xuất
| Nguồn | Trường | Dùng cho |
|:--|:--|:--|
| `fact_traffic_flow` | `segment_key`, `time_key`, `date_key` | Group key |
| `fact_traffic_flow` | `current_speed_kmh` | `avg_corridor_speed` |
| `fact_traffic_flow` | `free_flow_speed_kmh`, `current_speed_kmh` | `travel_time_index` |
| `fact_traffic_flow` | `delay_seconds` | `total_delay_seconds`, bottleneck |
| `bridge_corridor_segment` | `corridor_key`, `segment_key` | Join corridor |
| `fact_incident` | `segment_key`, `date_key`, `is_active` | `active_incident_count` |
| `dim_segment` | `segment_key`, `geometry_center` (hoặc `location_key`) | Lọc tập corridor Quận 1 |
| `dim_corridor` | `corridor_key` | Lọc corridor hợp lệ |

### 1.3 Ràng buộc phạm vi Quận 1 (BẮT BUỘC)
Chỉ aggregate cho **corridor Quận 1** theo 1 trong 2 cơ chế:
1. Spatial filter bằng bbox Quận 1 trên `dim_segment.geometry_center`:
   - `min_lon=106.663, min_lat=10.743, max_lon=106.723, max_lat=10.803`
2. Hoặc filter theo `dim_location` đã gắn nhãn Quận 1 (nếu có dimension hành chính chuẩn).

> Corridor có ít nhất 1 segment thuộc Quận 1 mới được đưa vào tập tính toán.

---

## 2) TARGET SCHEMA (`fact_corridor_performance`)

### 2.1 Cột khóa (PK/FK)
| Cột | Kiểu DB | Vai trò | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `corridor_perf_key` | `BIGINT` | **PK** | No | Surrogate key deterministic theo `corridor_key + date_key + time_key` |
| `corridor_key` | `BIGINT` | **FK** -> `dim_corridor.corridor_key` | No | Hành lang giao thông |
| `time_key` | `INT` | **FK** -> `dim_time_of_day.time_key` | No | Minute-of-day (`0..1439`) |
| `date_key` | `INT` | **FK** -> `dim_date.date_key` | No | `YYYYMMDD` |
| `bottleneck_seg_key` | `BIGINT` | **FK** -> `dim_segment.segment_key` | Yes | Segment có delay cao nhất tại corridor/time |

### 2.2 Cột thời gian/audit
| Cột | Kiểu DB | Nhóm | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `timestamp` | `TIMESTAMP` | Snapshot | No | Thời điểm tạo bản ghi aggregate |
| `inserted_at` | `TIMESTAMP` | Audit | No | Thời điểm ghi DB |

### 2.3 Cột metrics/flags
| Cột | Kiểu DB | Nhóm | Null | Mô tả |
|:--|:--|:--|:--:|:--|
| `avg_corridor_speed` | `DECIMAL(5,2)` | Metric | Yes | Tốc độ trung bình corridor |
| `total_delay_seconds` | `INT` | Metric | Yes | Tổng delay của các segment thuộc corridor-time |
| `travel_time_index` | `DECIMAL(4,2)` | Metric | Yes | TTI trung bình corridor |
| `corridor_efficiency` | `DECIMAL(3,2)` | Metric | Yes | Hiệu suất corridor [0.00..1.00] |
| `active_incident_count` | `INT` | Metric | Yes | Số incident đang active ảnh hưởng corridor |
| `quality_flag` | `SMALLINT` | Flag | Yes | Cờ chất lượng dữ liệu aggregate |

---

## 3) TRANSFORM & BUSINESS RULES

### 3.1 Quy tắc aggregate bắt buộc
Group theo:
- `corridor_key`, `date_key`, `time_key`

Công thức:
1. `avg_corridor_speed = AVG(f.current_speed_kmh)`
2. `total_delay_seconds = SUM(f.delay_seconds)`
3. `travel_time_index = AVG(CASE WHEN free_flow_speed_kmh > 0 THEN free_flow_speed_kmh / NULLIF(current_speed_kmh, 0) ELSE 1.0 END)`
4. `bottleneck_seg_key` = segment có `delay_seconds` lớn nhất trong cùng corridor/date/time.
5. `active_incident_count` = COUNT incident active (`is_active = TRUE`) trên các segment của corridor, theo cùng `date_key`.

### 3.2 Công thức corridor_efficiency
- Công thức chuẩn:
  - `corridor_efficiency = min(1.0, 1.0 / travel_time_index)` nếu `travel_time_index > 0`
  - ngược lại `0.0`
- Round 2 chữ số thập phân.

### 3.3 Sinh khóa `corridor_perf_key` (BẮT BUỘC deterministic)
- Dùng cùng cơ chế hash key của domain math.
- Input key tuple: `(corridor_key, date_key, time_key)`
- Công thức tương thích hàm hiện tại:
  - raw: `f"{corridor_key}:{date_key}:{time_key}"`
  - `hex15 = sha256(raw).hexdigest()[:15]`
  - `corridor_perf_key = int(hex15, 16)`

### 3.4 Quy tắc thời gian
- `date_key`, `time_key` lấy từ dữ liệu `fact_traffic_flow` đã chuẩn hóa múi giờ `Asia/Ho_Chi_Minh`.
- `timestamp` của record aggregate là thời điểm pipeline chạy (snapshot timestamp).

### 3.5 Fallback rules (BẮT BUỘC)
- `avg_speed` null -> `0.0`
- `total_delay` null -> `0`
- `travel_time_index` null -> `1.0`
- `active_incident_count` null -> `0`
- `bottleneck_seg_key` không xác định được -> `NULL` (không ép cứng)
- `quality_flag` mặc định `5` cho dữ liệu aggregate nightly.

### 3.6 Data quality & filtering rules
- Chỉ xử lý record có `corridor_key` hợp lệ trong `dim_corridor`.
- Corridor không có dữ liệu flow trong ngày mục tiêu thì không sinh record.
- **BẮT BUỘC** loại bỏ các corridor ngoài tập Quận 1 trước bước transform cuối.

---

## 4) LOADER STRATEGY (IDEMPOTENT)

### 4.1 Chiến lược nạp
- **BẮT BUỘC dùng UPSERT** (`INSERT ... ON CONFLICT DO UPDATE`).
- **TUYỆT ĐỐI KHÔNG** dùng delete-insert cho `fact_corridor_performance`.

### 4.2 Conflict Target
- `CONFLICT TARGET = (corridor_perf_key)`
- Lý do: PK đơn của bảng.

### 4.3 Cột phải DO UPDATE
Khi conflict, **BẮT BUỘC** cập nhật:
- `avg_corridor_speed`
- `total_delay_seconds`
- `travel_time_index`
- `corridor_efficiency`
- `active_incident_count`
- `inserted_at`

> Không update các cột định danh: `corridor_perf_key`, `corridor_key`, `date_key`, `time_key`.

### 4.4 Batch & transaction rules
- Batch size khuyến nghị: `200` records/batch.
- Bọc `commit` trong `try/except`; lỗi DB phải `rollback` trước khi raise.
- Loader input là `list[dict]` thuần để dễ test.

---

## 5) CONTRACT OUTPUT CHO AI GENERATOR

AI sinh code bắt buộc tạo đúng 3 thành phần:
1. **Aggregation/Transformer**: query + transform ra `list[dict]` theo schema mục 2.
2. **Business functions**: tính `TTI`, `corridor_efficiency`, `bottleneck_seg_key`, `corridor_perf_key` deterministic.
3. **Loader UPSERT**: conflict target và update columns theo mục 4.

Nếu có mâu thuẫn giữa code cũ và tài liệu này, **BẮT BUỘC ưu tiên tài liệu seed context này** khi sinh mới ETL cho corridor Quận 1.
