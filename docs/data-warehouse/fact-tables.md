# Data Warehouse — Fact Tables Reference

## 1. Bảng: `fact_traffic_flow` – Dòng chảy giao thông thời gian thực
Bảng Fact trung tâm lưu trữ chuỗi thời gian vận hành mạng lưới giao thông (tần suất crawl 5–15 phút).

- **Phân mảnh vật lý**: Declarative Range Partitioning theo `date_key` (phân vùng theo tháng).
- **Khóa chính**: `PRIMARY KEY (traffic_flow_key, date_key)`.
- **Chỉ mục**: `BRIN(timestamp)` và `BRIN(inserted_at)` để giảm 99% dung lượng index.

| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`traffic_flow_key` (PK)** | `BIGINT` | Khóa thay thế duy nhất |
| **`date_key` (PK/FK)** | `INT` | Khóa ngày `YYYYMMDD` (Partition key, liên kết `dim_date`) |
| `segment_key` (FK) | `BIGINT` | Liên kết `dim_segment` |
| `time_key` (FK) | `INT` | Phút trong ngày (liên kết `dim_time_of_day`) |
| `weather_key` (FK) | `INT` | Điều kiện thời tiết (liên kết `dim_weather`) |
| `timestamp` | `TIMESTAMP` | Thời điểm ghi nhận cảm biến |
| `pcu_volume` | `DECIMAL(10,2)` | Lưu lượng xe quy đổi (Passenger Car Unit) |
| `traffic_index` | `DECIMAL(3,2)` | Chỉ số giao thông ($0.00 \dots 1.00$) |
| `current_speed_kmh` | `DECIMAL(5,2)` | Vận tốc thực tế đo được (km/h) |
| `free_flow_speed_kmh` | `DECIMAL(5,2)` | Vận tốc thông thoáng ban đêm (km/h) |
| `delay_seconds` | `INT` | Độ trễ hành trình phát sinh (giây) |
| `los_level` | `CHAR(1)` | Mức phục vụ đường bộ Level of Service ($A \dots F$) |
| `congestion_level` | `TINYINT` | Cấp độ tắc nghẽn ($0 \dots 5$) |
| `is_closed` | `BOOLEAN` | Cờ đoạn đường bị phong tỏa / đóng tạm thời |
| `inserted_at` (MD) | `TIMESTAMP` | Thời điểm ETL nạp dữ liệu |
| `quality_flag` (MD) | `TINYINT` | Cờ kiểm tra chất lượng dữ liệu ($1 = \text{Hợp lệ}, 0 = \text{Nghi vấn}$) |

---

## 2. Bảng: `fact_incident` – Sự cố giao thông & Điểm nghẽn
Lưu trữ các điểm sự cố giao thông (tai nạn, ngập nước, công trình, cháy nổ) được xác thực hoặc tổng hợp từ cảm biến/người dân.

- **Khóa chính**: `incident_key` (`BIGINT`).
- **Chỉ mục không gian**: `GiST(geometry)`.

| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`incident_key` (PK)** | `BIGINT` | Khóa định danh sự cố |
| `segment_key` (FK) | `BIGINT` | Đoạn đường xảy ra sự cố (`dim_segment`) |
| `location_key` (FK) | `INT` | Vị trí hành chính (`dim_location`) |
| `time_key` (FK) | `INT` | Phút trong ngày (`dim_time_of_day`) |
| `date_key` (FK) | `INT` | Ngày xảy ra (`dim_date`) |
| `incident_type` | `VARCHAR(50)` | Phân loại: `ACCIDENT`, `FLOOD`, `CONSTRUCTION`, `FIRE`, `OTHER` |
| `severity_level` | `TINYINT` | Mức độ nghiêm trọng ($1 = \text{LOW} \dots 5 = \text{CRITICAL}$) |
| `delay_seconds` | `INT` | Độ trễ ước tính do sự cố gây ra |
| `geometry` | `GEOMETRY(Point, 4326)`| Tọa độ chính xác điểm sự cố |
| `is_simulated` | `BOOLEAN` | Sự cố thật (`false`) hay trong kịch bản giả lập (`true`) |
| `is_active` | `BOOLEAN` | Trạng thái sự cố đang diễn ra |
| `inserted_at` (MD) | `TIMESTAMP` | Thời điểm ghi nhận vào Data Warehouse |
| `quality_flag` (MD) | `TINYINT` | Cờ kiểm định chất lượng |

---

## 3. Bảng: `report_reliability` – Data Mart Độ tin cậy Hành lang
Bảng tổng hợp phân tích OLAP phục vụ tính toán chỉ số Buffer Index (BI) và Planning Time Index (PTI).

- **Khóa chính**: `report_key` (`BIGINT`).
- **Ràng buộc duy nhất**: `UNIQUE (segment_key, time_window, period_start, period_end)`.

| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`report_key` (PK)** | `BIGINT` | Khóa chính bản ghi báo cáo |
| `segment_key` (FK) | `BIGINT` | Liên kết `dim_segment` |
| `time_window` | `VARCHAR(20)` | Khung giờ phân tích: `AM_PEAK`, `PM_PEAK`, `OFF_PEAK` |
| `source_period` | `VARCHAR(20)` | Kỳ dữ liệu: `WEEKLY`, `MONTHLY` |
| `period_start` | `TIMESTAMP` | Thời điểm bắt đầu kỳ phân tích |
| `period_end` | `TIMESTAMP` | Thời điểm kết thúc kỳ phân tích |
| `t_avg` | `DECIMAL(10,2)` | Thời gian di chuyển trung bình ($T_{\text{avg}}$, giây) |
| `t_95` | `DECIMAL(10,2)` | Thời gian di chuyển phân vị 95 ($T_{95}$, giây) |
| `t_freeflow` | `DECIMAL(10,2)` | Thời gian di chuyển thông thoáng lúc 00:00-04:00 ($T_{\text{freeflow}}$, giây) |
| `buffer_index` | `DECIMAL(8,4)` | Buffer Index: $\text{BI} = (T_{95} - T_{\text{avg}}) / T_{\text{avg}}$ |
| `pti` | `DECIMAL(8,4)` | Planning Time Index: $\text{PTI} = T_{95} / T_{\text{freeflow}}$ |
| `accident_count` | `INT` | Số vụ tai nạn trong kỳ |
| `flood_count` | `INT` | Số lần ngập nước trong kỳ |
| `construction_count`| `INT` | Số công trình / rào chắn phát sinh trong kỳ |
| `sample_count` | `INT` | Số mẫu đo thu thập được trong kỳ |
| `quality_flag` | `TINYINT` | Cờ chất lượng tính toán ($1 = \text{Đủ mẫu}, 0 = \text{Thiếu mẫu}$) |

---

## 4. Bảng: `fact_corridor_performance` – Hiệu suất hành lang
Tổng hợp vĩ mô chỉ số hành lang theo khung giờ 15 phút.

| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`corridor_perf_key` (PK)**| `BIGINT` | Khóa chính |
| `corridor_key` (FK) | `BIGINT` | Liên kết `dim_corridor` |
| `date_key` (FK) | `INT` | Ngày (`dim_date`) |
| `time_key` (FK) | `INT` | Thời điểm (`dim_time_of_day`) |
| `bottleneck_seg_key` (FK)| `BIGINT` | Điểm nghẽn nghiêm trọng nhất trên hành lang (`dim_segment`) |
| `timestamp` | `TIMESTAMP` | Thời điểm tổng hợp |
| `avg_corridor_speed` | `DECIMAL(5,2)` | Vận tốc trung bình toàn hành lang (km/h) |
| `total_delay_seconds` | `INT` | Tổng độ trễ tích lũy trên hành lang |
| `travel_time_index` | `DECIMAL(4,2)` | TTI hành lang |
| `corridor_efficiency` | `DECIMAL(3,2)` | Hiệu suất thông hành ($0.0 \dots 1.0$) |
| `active_incident_count`| `INT` | Số lượng sự cố đang diễn ra trên hành lang |
| `inserted_at` (MD) | `TIMESTAMP` | Thời điểm lưu bản ghi |

---

## 5. Bảng: `fact_simulation_scenario` – Kịch bản mô phỏng
Lưu vết các phương án chạy mô phỏng phân luồng giao thông và kết quả cải thiện.

| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`simulation_key` (PK)** | `BIGINT` | Khóa chính kịch bản |
| `scenario_id` | `VARCHAR(50)` | Mã định danh kịch bản mô phỏng |
| `segment_key` (FK) | `BIGINT` | Đoạn đường được áp dụng mô phỏng |
| `incident_key` (FK) | `BIGINT` | Sự cố giả lập liên quan |
| `date_key` (FK) | `INT` | Ngày chạy mô phỏng |
| `time_key` (FK) | `INT` | Thời điểm chạy mô phỏng |
| `sim_avg_speed` | `DECIMAL(5,2)` | Vận tốc dự báo sau điều tiết (km/h) |
| `sim_travel_time` | `INT` | Thời gian di chuyển dự báo (giây) |
| `improvement_pct` | `DECIMAL(5,2)` | Tỷ lệ cải thiện so với hiện trạng (%) |
| `is_optimal_plan` | `BOOLEAN` | Được đánh dấu là phương án điều tiết tối ưu nhất |
| `inserted_at` (MD) | `TIMESTAMP` | Thời điểm lưu bản ghi |
