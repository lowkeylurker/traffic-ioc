# SEED CONTEXT: DATA SPECIFICATION FOR `fact_traffic_flow`

**Tới AI/Copilot:** Khi bạn viết Transformer hoặc Loader cho dữ liệu dòng chảy giao thông nạp vào `fact_traffic_flow`, BẠN BẮT BUỘC phải tuân thủ nghiêm ngặt các công thức toán học và cơ chế UPSERT dưới đây.

## 1. SOURCE DATA (Nguồn dữ liệu)
- **Nguồn:** TomTom Traffic Flow API (Real-time, mỗi 15 phút).
- **Trường cần lấy:** `currentSpeed`, `freeFlowSpeed`, `currentTravelTime`, `freeFlowTravelTime`, `confidence`, `roadClosure`.

## 2. TARGET SCHEMA (Bảng `fact_traffic_flow`)
- **Primary/Foreign Keys:**
  - `traffic_flow_key` (BIGINT, PK - Khóa băm)
  - `segment_key` (BIGINT, FK -> dim_segment)
  - `date_key` (INT, FK -> dim_date / format YYYYMMDD)
  - `time_key` (INT, FK -> dim_time / minute of day 0-1439)
  - `weather_key` (INT, FK -> dim_weather / Lấy từ trạm thời tiết gần nhất)
- **Metrics (Chỉ số đo lường):**
  - `current_speed_kmh` (FLOAT)
  - `free_flow_speed_kmh` (FLOAT)
  - `delay_seconds` (INT)
  - `traffic_index` (FLOAT)
  - `los_level` (VARCHAR)
  - `congestion_level` (SMALLINT)
  - `pcu_volume` (FLOAT) - Lưu lượng ước tính.
- **Flags (Cờ trạng thái):**
  - `is_closed` (BOOLEAN)
  - `quality_flag` (SMALLINT)

## 3. TRANSFORM & BUSINESS RULES (Công thức tính toán bắt buộc)
Bạn phải viết các hàm biến đổi (hoặc gọi từ `math_calc.py`) theo đúng logic sau:
- **Keys:**
  - `traffic_flow_key`: Hash string `f"{segment_key}_{date_key}_{time_key}"` ra số nguyên lớn.
  - `date_key`: Chuyển `timestamp` UTC sang múi giờ Asia/Ho_Chi_Minh, format `YYYYMMDD`.
  - `time_key`: `hour * 60 + minute`.
- **Metrics:**
  - `delay_seconds`: `currentTravelTime - freeFlowTravelTime` (Nếu < 0 thì gán = 0).
  - `traffic_index`: `1.0 - (currentSpeed / freeFlowSpeed)`. Clamp [0.0, 1.0].
  - `los_level`: Dựa vào `traffic_index`: <=0.15(A), <=0.30(B), <=0.45(C), <=0.60(D), <=0.80(E), >0.80(F).
  - `congestion_level`: Map LOS sang số nguyên (A=0, B=1, C=2, D=3, E=4, F=5).
  - `pcu_volume`: Dùng hàm BPR ngược. `time_ratio = freeFlowSpeed/currentSpeed`. `v_c_ratio = min(((time_ratio - 1) / 0.15) ** 0.25, 1.2)`. `pcu_volume = round(v_c_ratio * lane_count * 2000, 2)`.
  - `quality_flag`: `round(confidence * 9)`. (Nếu Null gán = 1).
  - `is_closed`: Lấy trực tiếp từ `roadClosure`.

## 4. LOADER STRATEGY (Chiến lược UPSERT)
- **Khóa xung đột (Conflict Target):** `(segment_key, date_key, time_key)` hoặc `traffic_flow_key`.
- **Hành động (DO UPDATE):** Cập nhật toàn bộ Metrics (current_speed_kmh, delay_seconds, traffic_index, los_level, congestion_level, pcu_volume) và `inserted_at = func.now()`.