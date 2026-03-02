# SEED CONTEXT: DATA SPECIFICATION FOR `fact_incident`

**Tới AI/Copilot:** Bảng `fact_incident` lưu trữ các sự cố giao thông (tai nạn, thi công, kẹt xe). Khi code Transformer/Loader, BẮT BUỘC tuân thủ các quy tắc xử lý không gian (Spatial) và phân loại mức độ sự cố sau.

## 1. SOURCE DATA
- **Nguồn:** TomTom Incident Details API.
- **Trường cần lấy:** `id`, `iconCategory`, `magnitudeOfDelay`, `delay`, `length`, `startTime`, `endTime`, `geometry.coordinates`.

## 2. TARGET SCHEMA
- **Keys:**
  - `incident_key` (BIGINT, PK)
  - `segment_key` (BIGINT, FK - Map matching)
  - `date_key` (INT)
  - `time_key` (INT)
- **Metrics & Attributes:**
  - `incident_type` (VARCHAR)
  - `severity_level` (SMALLINT)
  - `delay_seconds` (INT)
  - `length_m` (FLOAT)
  - `geometry` (PostGIS Geometry)
  - `is_active` (BOOLEAN)

## 3. TRANSFORM & BUSINESS RULES
- **Keys Generation:**
  - `incident_key`: Hàm băm (Hash) chuỗi `id` của TomTom ra BIGINT.
  - `date_key`, `time_key`: Parse từ `startTime` (Asia/Ho_Chi_Minh).
- **Spatial Transform:**
  - Mảng `geometry.coordinates` của API là một LineString. BẮT BUỘC phải dùng thư viện Shapely để tính Trọng tâm (Centroid) của LineString này -> Chuyển thành Point WKT: `f"SRID=4326;POINT({lon} {lat})"`.
- **Mapping & Fallback:**
  - `incident_type`: Map từ `iconCategory` (1: accident, 6: jam, 8: road_closed, 9: road_works, default: unknown).
  - `severity_level`: Lấy từ `magnitudeOfDelay`. Nếu giá trị này Null hoặc = 0, BẮT BUỘC fallback về `0`.
  - `length_m`: Lấy trực tiếp từ `length`.
  - `delay_seconds`: Lấy từ `delay`.
  - `is_active`: Nếu `endTime` > `now()` thì `True`, ngược lại `False`.

## 4. LOADER STRATEGY (Chiến lược UPSERT)
- **Khóa xung đột:** `incident_key`.
- **Hành động (DO UPDATE):** Cập nhật `severity_level`, `delay_seconds`, `length_m`, `is_active`, và `updated_at = func.now()`.