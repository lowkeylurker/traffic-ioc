# SEED CONTEXT: DATA TRANSFORMATION & MAPPING RULES (PART 3 - INCIDENT, WEATHER & LOADERS)

**Tới AI/Copilot:** Đây là phần đặc tả cuối cùng. Khi bạn viết code cho `weather_transformer.py`, `incident_transformer.py` hoặc các file trong thư mục `src/loaders/` nạp dữ liệu vào PostgreSQL, BẠN BẮT BUỘC phải áp dụng các quy tắc ánh xạ và cơ chế UPSERT dưới đây.

## 1. TRANSFORM THỜI TIẾT (`dim_weather`)
- **Nguồn:** OpenWeatherMap API.
- **Biến đổi `severity_level`:** Ánh xạ từ `weather_id` của API (Integer) sang mức độ nghiêm trọng (0-5):
  * `200 <= id <= 299` (Dông bão) -> Trả về `4`
  * `300 <= id <= 399` (Mưa phùn) -> Trả về `2`
  * `500 <= id <= 699` (Mưa/Tuyết) -> Trả về `3`
  * `700 <= id <= 799` (Sương mù) -> Trả về `1`
  * `800 <= id <= 899` (Trời quang/Mây) -> Trả về `0` (Không ảnh hưởng)
  * Default/Unknown -> Trả về `0`

## 2. TRANSFORM SỰ CỐ (`fact_incident`)
- **Nguồn:** TomTom Incident Details API.
- **Biến đổi `incident_type`:** Dựa vào `iconCategory` của TomTom.
  * Ví dụ: `1` -> `'accident'`, `6` -> `'jam'`, `8` -> `'road_closed'`, `11` -> `'flooding'`, default -> `'unknown'`.
- **Quy tắc Fallback cho `severity_level`:**
  * Dựa vào `magnitudeOfDelay` của TomTom.
  * **ĐIỀU KIỆN BẮT BUỘC:** Nếu `magnitudeOfDelay` bị Null, khuyết, hoặc bằng `0` (Unknown delay), BẮT BUỘC gán `severity_level = 0` để tránh tạo cảnh báo rác trên hệ thống.
- **Trạng thái Sự cố (`is_active`):**
  * So sánh: Nếu `endTime` (thời gian kết thúc sự cố từ API) > `thời điểm hiện tại (now)`, gán `is_active = True`. Ngược lại gán `False`.

## 3. LOADER STRATEGY: IDEMPOTENCY & UPSERT (CHIẾN LƯỢC NẠP DỮ LIỆU)
Tuyệt đối KHÔNG sử dụng `session.add_all()` thông thường vì sẽ gây lỗi IntegrityError khi cronjob chạy lại. BẮT BUỘC sử dụng tính năng UPSERT của PostgreSQL thông qua `sqlalchemy.dialects.postgresql.insert`.

### A. Quy tắc UPSERT cho `fact_traffic_flow`
- **Import:** `from sqlalchemy.dialects.postgresql import insert`
- **Khóa xung đột (Index/PK):** `traffic_flow_key` và `date_key` (Composite PK do Partitioning).
- **Hành động (DO UPDATE):** Khi có xung đột, cập nhật các trường:
  `current_speed_kmh`, `delay_seconds`, `traffic_index`, `los_level`, `congestion_level`, `is_closed`, `quality_flag`, và `inserted_at` (cập nhật bằng func.now()).

### B. Quy tắc UPSERT cho `fact_incident`
- **Khóa xung đột:** `incident_key` và `date_key`.
- **Hành động (DO UPDATE):** Khi có xung đột, cập nhật:
  `severity_level`, `delay_seconds`, `is_active`, `quality_flag`, và `inserted_at`.

### C. Quy tắc INSERT cho `dim_weather` (Dữ liệu tĩnh)
- **Khóa xung đột:** `weather_key`.
- **Hành động (DO NOTHING):** Vì mã thời tiết là danh mục, chỉ cần dùng `ON CONFLICT DO NOTHING`.

## 4. QUY TẮC TỐI ƯU HIỆU NĂNG (PERFORMANCE BATCHING)
- Mọi hàm nạp (Load) phải nhận đầu vào là một `list[dict]` (danh sách các dictionary).
- Bắt buộc thực thi nạp theo lô.
- Bắt buộc phải có khối `try...except` bọc quanh lệnh `session.commit()`. Nếu xảy ra lỗi Database (ví dụ `OperationalError`), phải gọi `session.rollback()` trước khi raise lỗi lên tầng trên.