# SEED CONTEXT: DATA TRANSFORMATION & MAPPING RULES (PART 2 - SPATIAL & FALLBACKS)

**Tới AI/Copilot:** Khi bạn được yêu cầu viết code xử lý dữ liệu không gian từ OpenStreetMap (thông qua thư viện `osmnx` hoặc file JSON) để nạp vào các bảng `dim_node`, `dim_segment`, `dim_way`, BẠN BẮT BUỘC phải áp dụng chính xác các quy tắc Fallback (xử lý dữ liệu khuyết) và biến đổi hình học dưới đây.

## 1. TRANSFORM NODE (`dim_node`)
- **Nguồn:** OSM Node (`osmid`, `y` (lat), `x` (lon), `highway`, `street_count`).
- **Map vào DB:**
  * `node_source_id` = `osmid` (Kiểu BIGINT)
  * `geometry` = Chuyển đổi tọa độ thành WKT (Well-Known Text) format: `f"SRID=4326;POINT({x} {y})"`.
- **Logic rẽ nhánh `node_type`:**
  * Nếu `highway == 'traffic_signals'` -> Trả về `'signalized'` (Nút giao có đèn).
  * Nếu `street_count >= 3` -> Trả về `'intersection'` (Ngã ba, ngã tư).
  * Nếu `street_count == 1` -> Trả về `'terminal'` (Đường cụt / Điểm biên).
  * Các trường hợp còn lại -> Trả về `'intermediate'`.

## 2. TRANSFORM SEGMENT & WAY (`dim_segment`, `dim_way`)
- **Nguồn:** OSM Edge (`u`, `v`, `highway`, `name`, `lanes`, `maxspeed`, `width`, `geometry`).
- **Map vào DB:**
  * `from_node_key` = Nút bắt đầu (`u`).
  * `to_node_key` = Nút kết thúc (`v`).
  * `geometry_linestring` = Chuyển chuỗi tọa độ thành WKT format: `f"SRID=4326;LINESTRING({lon1} {lat1}, {lon2} {lat2}, ...)"`.

## 3. BUSINESS LOGIC: FALLBACK RULES (XỬ LÝ DỮ LIỆU KHUYẾT BẮT BUỘC)
Dữ liệu OSM có độ phủ rất thấp. Bạn BẮT BUỘC phải viết các hàm Fallback xử lý khi dữ liệu bị `None`, `Null` hoặc rỗng `""`. Tuyệt đối không để throw Exception.

### A. Xử lý Tên đường (`name`) - Độ phủ 84.5%
- **Logic:** Nếu `name` là `None` hoặc mảng rỗng:
  1. Thử nội suy bằng Spatial Join (Lấy tên của đoạn đường lân cận).
  2. Nếu vẫn không có, BẮT BUỘC gán giá trị mặc định là chuỗi `"N/A"`.

### B. Xử lý Số làn đường (`lanes`) - Độ phủ 58.5%
- **Input:** Biến `highway` (loại đường).
- **Fallback Rule (Ánh xạ theo loại đường):**
  * `trunk` (Trục chính) -> `4` (làn)
  * `primary` (Đường cấp 1) -> `3`
  * `secondary`, `tertiary`, `residential` -> `2`
  * `living_street` -> `1`
  * Mặc định (Default) -> `2`

### C. Xử lý Giới hạn tốc độ (`maxspeed`) - Độ phủ 30.0%
- **Input:** Biến `highway` (loại đường).
- **Fallback Rule (Quy chuẩn đô thị km/h):**
  * `trunk` -> `60.0`
  * `primary` -> `50.0`
  * `secondary`, `tertiary` -> `40.0`
  * `residential` -> `30.0`
  * `living_street` -> `20.0`
  * Mặc định (Default) -> `40.0`

### D. Xử lý Chiều rộng (`width`) - Độ phủ 0.6%
- **Logic:** Độ phủ quá thấp. BỎ QUA hoàn toàn trường này trong quá trình Transform. Không nạp vào Database.

### E. Ánh xạ Cấp đường TomTom (`tomtom_frc`)
- **Logic:** Quy đổi loại đường OSM sang mã FRC của TomTom (Số nguyên từ 0-6):
  * `trunk` -> `0`
  * `primary` -> `2`
  * `secondary` -> `4`
  * `tertiary` -> `5`
  * `residential` -> `6`
  * Mặc định (Default) -> `6`

## 4. LOADER CONSTRAINT (SQLAlchemy PostGIS)
Khi nạp các trường `geometry` hoặc `geometry_linestring` vào Database bằng SQLAlchemy, bắt buộc phải import và sử dụng hàm `ST_GeomFromText`:
`from sqlalchemy import func`
Và map giá trị: `geometry: func.ST_GeomFromText(wkt_string, 4326)`