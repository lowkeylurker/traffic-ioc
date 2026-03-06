# Thiết kế Fact Tables – Phase 1

## 1. Bảng: `fact_traffic_flow` – Dòng chảy giao thông

Lưu trữ các chỉ số vận hành cơ bản của mạng lưới giao thông theo thời gian thực.

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **traffic_flow_key (PK)** | BIGINT | Khóa chính duy nhất cho mỗi bản ghi |
| segment_key (FK) | BIGINT | Liên kết `dim_segment` |
| time_key (FK) | INT | Liên kết `dim_time_of_day` |
| date_key (FK) | INT | Liên kết `dim_date` |
| weather_key (FK) | INT | Liên kết `dim_weather` |
| timestamp | TIMESTAMP | Thời điểm chính xác của bản ghi |
| pcu_volume | DECIMAL(10,2) | Lưu lượng xe quy đổi |
| traffic_index | DECIMAL(3,2) | Chỉ số giao thông (0.0–1.0) |
| current_speed_kmh | DECIMAL(5,2) | Vận tốc thực tế (km/h) |
| free_flow_speed_kmh | DECIMAL(5,2) | Vận tốc thông thoáng |
| delay_seconds | INT | Độ trễ (giây) |
| los_level | CHAR(1) | Level of Service (A–F) |
| congestion_level | TINYINT | Mức tắc nghẽn (0–5) |
| is_closed | BOOLEAN | Đoạn đường bị đóng |
| inserted_at (MD) | TIMESTAMP | Thời điểm nạp dữ liệu |
| quality_flag (MD) | TINYINT | Cờ chất lượng |

---

## 2. Bảng: `fact_incident` – Sự cố giao thông

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **incident_key (PK)** | BIGINT | Định danh sự cố |
| time_key (FK) | INT | Thời điểm |
| date_key (FK) | INT | Ngày |
| segment_key (FK) | BIGINT | Đoạn đường |
| location_key (FK) | INT | Vị trí hành chính |
| incident_type | VARCHAR(50) | Loại sự cố |
| timestamp | TIMESTAMP | Thời điểm xảy ra |
| severity_level | TINYINT | Mức độ (1–5) |
| delay_seconds | INT | Tổng trễ |
| geometry | GEOMETRY(Point,4326) | Tọa độ |
| is_simulated | BOOLEAN | Giả lập hay thực |
| is_active | BOOLEAN | Trạng thái |
| inserted_at (MD) | TIMESTAMP | Thời điểm ghi nhận |
| quality_flag (MD) | TINYINT | Độ tin cậy |

---

## 3. Bảng: `fact_event` – Sự kiện xã hội

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **event_id (PK)** | BIGINT | Khóa chính |
| start_time_key (FK) | INT | Bắt đầu |
| end_time_key (FK) | INT | Kết thúc |
| date_key (FK) | INT | Ngày |
| location_key (FK) | BIGINT | Địa điểm |
| event_type | VARCHAR(50) | Loại sự kiện |
| attendance_scale | INT | Quy mô |
| impact_radius_m | INT | Bán kính ảnh hưởng |
| event_title | VARCHAR(255) | Tên sự kiện |
| inserted_at (MD) | TIMESTAMP | Thời điểm nạp |
| quality_flag (MD) | TINYINT | Độ tin cậy |

---

## 4. Bảng: `fact_traffic_risk_prediction` – Dự báo rủi ro

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **prediction_key (PK)** | BIGINT | Khóa chính |
| segment_key (FK) | BIGINT | Đoạn đường |
| time_key (FK) | INT | Thời điểm |
| date_key (FK) | INT | Ngày |
| timestamp | TIMESTAMP | Thời điểm dự báo |
| horizon_minutes | INT | Phạm vi dự báo |
| predicted_risk_score | DECIMAL(3,2) | Điểm rủi ro |
| confidence_level | DECIMAL(3,2) | Độ tin cậy |
| model_version | VARCHAR(20) | Phiên bản model |
| inserted_at (MD) | TIMESTAMP | Thời điểm lưu |
| quality_flag (MD) | TINYINT | Độ chính xác |

---

## 5. Bảng: `fact_simulation_scenario` – Giả lập CityFlow

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **simulation_key (PK)** | BIGINT | Khóa chính |
| time_key (FK) | INT | Thời điểm |
| date_key (FK) | INT | Ngày |
| segment_key (FK) | BIGINT | Đoạn đường |
| incident_key (FK) | BIGINT | Sự cố |
| scenario_id | VARCHAR(50) | Mã kịch bản |
| timestamp | TIMESTAMP | Hoàn thành |
| sim_avg_speed | DECIMAL(5,2) | Vận tốc mô phỏng |
| sim_travel_time | INT | Thời gian đi |
| improvement_pct | DECIMAL(5,2) | % cải thiện |
| is_optimal_plan | BOOLEAN | Phương án tối ưu |
| inserted_at (MD) | TIMESTAMP | Thời điểm lưu |
| quality_flag (MD) | TINYINT | Độ tin cậy |

---

## 6. Bảng: `fact_corridor_performance` – Hiệu suất hành lang

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **corridor_perf_key (PK)** | BIGINT | Khóa chính |
| corridor_key (FK) | BIGINT | Hành lang |
| time_key (FK) | INT | Thời điểm |
| date_key (FK) | INT | Ngày |
| bottleneck_seg_key (FK) | BIGINT | Đoạn kẹt nhất |
| timestamp | TIMESTAMP | Thời gian tổng hợp |
| avg_corridor_speed | DECIMAL(5,2) | Vận tốc TB |
| total_delay_seconds | INT | Tổng trễ |
| travel_time_index | DECIMAL(4,2) | TTI |
| corridor_efficiency | DECIMAL(3,2) | Hiệu quả |
| active_incident_count | INT | Số sự cố |
| inserted_at (MD) | TIMESTAMP | Thời điểm lưu |
| quality_flag (MD) | TINYINT | Độ tin cậy |
