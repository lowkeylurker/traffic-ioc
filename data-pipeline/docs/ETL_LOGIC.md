# ETL Logic Documentation - traffic-ioc Data Pipeline

Tài liệu này chi tiết hóa logic xử lý dữ liệu (ETL - Extract, Transform, Load) trong thư mục `data-pipeline`.

## 1. Kiến trúc Tổng quan (Base Pattern)

Hệ thống sử dụng mô hình hướng đối tượng dựa trên các lớp trừu tượng tại `src/pipelines/base.py`:

*   **Extractor (`BaseExtractor`)**: Chịu trách nhiệm lấy dữ liệu thô từ nguồn ngoài (TomTom, OpenWeather, OSM). Hỗ trợ tự động retry với `tenacity` và quản lý API key pool để tối ưu hóa quota.
*   **Transformer (`BaseTransformer`)**: Chứa logic cốt lõi. Đây là các **pure functions** (không side-effect), nhận dữ liệu thô và trả về danh sách các bản ghi (dict) sẵn sàng nạp vào database.
*   **Loader (`BaseLoader`)**: Thực hiện nạp dữ liệu vào PostgreSQL. 100% sử dụng cơ chế **UPSERT** (`ON CONFLICT DO UPDATE`) để đảm bảo tính idempotent (chạy lại nhiều lần không trùng dữ liệu) và tự động tạo bảng phân vùng (partition) theo tháng.

---

## 2. Real-time Pipelines (Dữ liệu thời gian thực)

### 2.1 Traffic Flow Pipeline (`traffic_pipeline.py`)

*   **Extract**: Gọi TomTom Traffic Flow API cho từng đoạn đường (segment).
*   **Transform Logic**:
    *   **Validation**: Kiểm tra tính hợp lệ của vận tốc và độ tin cậy (confidence).
    *   **Traffic Index**: Tính tỷ lệ vận tốc hiện tại / vận tốc tự do (free-flow).
    *   **LOS (Level of Service)**: Phân cấp mức độ phục vụ (A-F) dựa trên Traffic Index.
    *   **Congestion Level**: Phân loại mức độ ùn tắc (Low, Medium, Heavy, etc.).
    *   **Delay Calculation**: Tính thời gian trễ ($T_{current} - T_{freeflow}$).
    *   **PCU Volume Estimation**: Ước lượng lưu lượng xe quy đổi (PCU) sử dụng hàm **BPR (Bureau of Public Roads)** dựa trên vận tốc và số làn đường.
*   **Load**: Upsert vào `fact_traffic_flow`.

### 2.2 Incident Pipeline (`incident_pipeline.py`)

*   **Extract**: Lấy dữ liệu sự cố giao thông (tai nạn, công trường, v.v.) trong vùng Bounding Box TP.HCM.
*   **Transform Logic**:
    *   **Spatial Mapping**: Sử dụng truy cập không gian PostGIS (`<->`) để tìm đoạn đường (`dim_segment`) gần nhất với tọa độ sự cố.
    *   **Magnitude Normalization**: Chuẩn hóa mức độ nghiêm trọng của sự cố từ TomTom (0-4) về thang đo của hệ thống.
    *   **Icon Mapping**: Chuyển đổi mã icon của TomTom thành các loại sự cố tường minh (Accident, Jam, Construction).
    *   **Activity Status**: Xác định sự cố còn hiệu lực hay đã kết thúc dựa trên `end_time`.
*   **Load**: Upsert vào `fact_incident` kèm dữ liệu không gian PostGIS (`geometry`).

---

## 3. Spatial Network Pipelines (Hạ tầng mạng lưới)

### 3.1 OSM Pipeline (`osm_pipeline.py`)

*   **Extract**: Sử dụng thư viện `osmnx` để tải sơ đồ đường phố từ OpenStreetMap.
*   **Transform Logic**:
    *   **Network Topology**: Phân tách mạng lưới thành các Node (nút giao), Road (tên đường), Way (đường OSM) và Segment (đoạn nối giữa 2 node).
    *   **Metric Calculation**: Tính toán chiều dài đoạn đường, số làn đường mặc định, tốc độ tối đa và công suất thiết kế (Design Capacity).
    *   **Geometry Generation**: Tạo bản ghi WKT cho Point (Center) và LineString (Geometry thực tế của đoạn đường).
*   **Load**: Nạp theo thứ tự ràng buộc khóa ngoại (FK): `dim_node` → `dim_road` → `dim_way` → `dim_segment`.

---

## 4. ML & Analytics Pipelines (Tổng hợp & Tính toán)

### 4.1 Corridor Performance (`ml_features/corridor_pipeline.py`)

Đây là bước hậu xử lý (Batch Processing):
*   **Extract**: Truy vấn SQL tổng hợp từ `fact_traffic_flow` và `fact_incident`.
*   **Transform Logic**:
    *   **Aggregation**: Tính vận tốc trung bình và tổng thời gian trễ trên toàn bộ hành lang (corridor).
    *   **TTI (Travel Time Index)**: Chỉ số thời gian hành trình ($\frac{Time_{current}}{Time_{freeflow}}$).
    *   **Corridor Efficiency**: Hiệu suất hành lang, tính bằng $1/TTI$ (giới hạn tối đa 1.0).
    *   **Bottleneck Detection**: Xác định đoạn đường gây tắc nghẽn nhất (đoạn có `delay_seconds` cao nhất) trong hành lang.
*   **Load**: Upsert vào `fact_corridor_performance`.

---

## 5. Điều phối & Chiến lược nạp dữ liệu (`main.py`)

Hệ thống áp dụng chiến lược **Budget-Safe Realtime**:
1.  **Key Pool Management**: Tự động tính toán số lượng request an toàn dựa trên số lượng API Key hiện có.
2.  **Critical Segment Selection**: Thay vì quét toàn bộ thành phố (gây tốn kém/chậm), hệ thống ưu tiên các đoạn đường thuộc **Gold Corridors** (Hành lang trọng điểm) và các đoạn có "Critical Score" cao (dựa trên dữ liệu lịch sử về ùn tắc và sự cố).
3.  **Cyclic Execution**: Chạy định kỳ mỗi 15 phút (Real-time) và chạy tổng hợp dữ liệu vào cuối ngày (Batch).
