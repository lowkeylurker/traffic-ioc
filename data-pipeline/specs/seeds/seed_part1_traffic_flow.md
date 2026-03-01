# SEED CONTEXT: DATA TRANSFORMATION & MAPPING RULES (PART 1 - TRAFFIC FLOW)

**Tới AI/Copilot:** Hãy đọc kỹ cấu trúc mapping và logic transform dưới đây. Bất cứ khi nào bạn được yêu cầu viết code cho tầng Transformers (ví dụ `traffic_transformer.py`), các hàm Utils (`math_calc.py`) hoặc Loaders cho bảng `fact_traffic_flow`, BẠN BẮT BUỘC phải áp dụng chính xác các công thức và quy tắc rẽ nhánh này.

## 1. SOURCE TO TARGET MAPPING (TomTom API -> `fact_traffic_flow`)
- Source API: TomTom Traffic Flow (`flowSegmentData`)
- Target Table: `fact_traffic_flow` trong PostgreSQL
- Mapping trực tiếp:
  * `currentSpeed` (float) -> `current_speed_kmh` (DECIMAL)
  * `freeFlowSpeed` (float) -> `free_flow_speed_kmh` (DECIMAL)
  * Tọa độ GPS -> Cần thuật toán Map Matching (Centroid) để ánh xạ ra `segment_key`.

## 2. BUSINESS LOGIC & TRANSFORMATIONS (Các hàm Pure Functions)

### A. Tính toán Chỉ số Giao thông (Traffic Index)
- **Công thức:** `traffic_index = 1.0 - (currentSpeed / freeFlowSpeed)`
- **Xử lý ngoại lệ (Edge cases):**
  * Nếu `freeFlowSpeed <= 0` hoặc Null: Trả về `0.0` (Tránh lỗi chia 0).
  * Giới hạn (Clamp) kết quả: Nếu `traffic_index < 0.0` thì gán `= 0.0`. Nếu `traffic_index > 1.0` thì gán `= 1.0`.
  * Làm tròn (Round): 2 chữ số thập phân.

### B. Mức độ Phục vụ (LOS Level) & Cấp độ tắc nghẽn (Congestion Level)
- **Input:** `traffic_index` (vừa tính ở trên).
- **Quy tắc rẽ nhánh (Mapping Rule):**
  * `traffic_index <= 0.15` -> LOS = `'A'` -> `congestion_level = 0` (Thông thoáng)
  * `0.15 < traffic_index <= 0.30` -> LOS = `'B'` -> `congestion_level = 1`
  * `0.30 < traffic_index <= 0.45` -> LOS = `'C'` -> `congestion_level = 2`
  * `0.45 < traffic_index <= 0.60` -> LOS = `'D'` -> `congestion_level = 3`
  * `0.60 < traffic_index <= 0.80` -> LOS = `'E'` -> `congestion_level = 4` (Tắc nghẽn)
  * `traffic_index > 0.80` -> LOS = `'F'` -> `congestion_level = 5` (Vỡ trận)

### C. Tính Độ trễ (Delay Seconds)
- **Công thức:** `delay_seconds = currentTravelTime - freeFlowTravelTime`
- **Xử lý ngoại lệ:** Nếu kết quả `< 0` (do xe chạy nhanh hơn vận tốc thiết kế), bắt buộc gán `delay_seconds = 0`. Trả về kiểu Integer.

### D. Ước tính Lưu lượng (PCU Volume) bằng hàm BPR (Bureau of Public Roads)
Đây là logic giả lập lưu lượng vì không có camera AI.
- **Input:** `currentSpeed`, `freeFlowSpeed`, `lane_count` (lấy từ bảng dimension `dim_segment`).
- **Tham số cấu hình:** Sức chứa 1 làn = `2000` PCU/giờ. Hệ số BPR: `alpha = 0.15`, `beta = 4.0` (tương đương mũ `0.25` khi đảo ngược).
- **Quy tắc tính toán (Flow):**
  1. `capacity = lane_count * 2000.0`
  2. Nếu `currentSpeed >= freeFlowSpeed`: Đường cực vắng, gán `pcu_volume = capacity * 0.1`. (10% sức chứa).
  3. Nếu không, tính tỷ lệ thời gian: `time_ratio = freeFlowSpeed / currentSpeed`.
  4. Tính tỷ lệ V/C: `v_c_ratio = ((time_ratio - 1) / 0.15) ** 0.25`.
  5. **Clamp giá trị:** `v_c_ratio = min(v_c_ratio, 1.2)` (Tối đa kẹt xe 120% sức chứa).
  6. **Kết quả:** `pcu_volume = round(v_c_ratio * capacity, 2)`.

### E. Tính Cờ chất lượng (Quality Flag)
- **Nguồn:** Trường `confidence` của TomTom (từ 0.0 đến 1.0).
- **Biến đổi:** `quality_flag = round(confidence * 9)`. (Chuyển sang thang điểm 0-9 để lưu db `SMALLINT`). Nếu API thiếu trường này, gán mặc định `= 1`.

## 3. ID GENERATION & TIMESTAMP
- `date_key`: Parse `timestamp` sang múi giờ Asia/Ho_Chi_Minh. Chuyển thành số nguyên `YYYYMMDD` (VD: 20240228).
- `time_key`: `(hour * 60) + minute` (Kết quả từ 0 đến 1439).
- `traffic_flow_key`: Bắt buộc tạo bằng thuật toán Hash tạo BIGINT. Dùng hashlib.sha256 format string: `f"{segment_key}_{date_key}_{time_key}"` rồi lấy 15 số đầu.