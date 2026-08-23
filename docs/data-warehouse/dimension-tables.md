# Data Warehouse — Dimension Tables Reference

## 1. Road Infrastructure Dimensions (Spatial Network)

### Bảng: `dim_node` – Nút giao thông
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`node_key` (PK)** | `BIGINT` | Khóa chính đại diện cho nút giao hoặc điểm tọa độ trên đồ thị |
| `node_source_id` | `BIGINT` | ID định danh từ OpenStreetMap (`osmid`) |
| `is_snapped` | `BOOLEAN` | Đã được snap khớp vào mạng lưới đường bộ hay chưa |
| `node_type` | `VARCHAR(30)` | Phân loại nút: `signalized`, `intersection`, `terminal` |
| `geometry` | `GEOMETRY(Point, 4326)` | Tọa độ không gian (Point WGS84) của nút giao |
| `record_timestamp` | `TIMESTAMP` | Thời điểm tạo / cập nhật bản ghi |

---

### Bảng: `dim_segment` – Phân đoạn đường chi tiết
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`segment_key` (PK)** | `BIGINT` | Khóa chính duy nhất cho từng phân đoạn đường |
| `from_node_key` (FK) | `BIGINT` | Nút giao bắt đầu (liên kết `dim_node`) |
| `to_node_key` (FK) | `BIGINT` | Nút giao kết thúc (liên kết `dim_node`) |
| `way_key` (FK) | `BIGINT` | Tuyến đường chứa phân đoạn (liên kết `dim_way`) |
| `location_key` (FK) | `INT` | Vị trí địa lý hành chính (liên kết `dim_location`) |
| `segment_id_source` | `BIGINT` | ID phân đoạn từ nguồn TomTom / OSM |
| `length_m` | `DECIMAL(10,2)` | Chiều dài thực tế của phân đoạn (mét) |
| `geometry_center` | `GEOMETRY(Point, 4326)` | Tọa độ trung tâm phục vụ spatial KNN snapping |
| `geometry_linestring` | `GEOMETRY(LineString, 4326)` | Vector hình học của phân đoạn |
| `is_one_way` | `BOOLEAN` | Tuyến 1 chiều (`true`) hoặc 2 chiều (`false`) |
| `record_timestamp` | `TIMESTAMP` | Thời điểm ghi nhận dữ liệu |

---

### Bảng: `dim_way` – Tuyến đường OpenStreetMap
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`way_key` (PK)** | `BIGINT` | Khóa chính gom nhóm các phân đoạn |
| `road_key` (FK) | `BIGINT` | Liên kết tên đường chính (`dim_road`) |
| `total_length_m` | `DECIMAL(10,2)` | Tổng chiều dài toàn tuyến (mét) |
| `direction` | `VARCHAR(20)` | Hướng di chuyển (`Forward` / `Backward` / `Both`) |
| `segment_count` | `INT` | Số lượng segment cấu thành |
| `default_lane_count`| `INT` | Số làn xe mặc định |
| `design_capacity` | `INT` | Sức chứa phương tiện thiết kế (PCU/giờ) |
| `default_speed_limit`| `INT` | Giới hạn tốc độ quy định (km/h) |
| `tomtom_frc` | `TINYINT` | Phân cấp chức năng đường TomTom (0–6) |
| `osm_highway_type` | `VARCHAR(30)` | Phân loại đường OSM (`motorway`, `trunk`, `primary`, `secondary`) |
| `record_timestamp` | `TIMESTAMP` | Thời điểm cập nhật |

---

### Bảng: `dim_road` – Danh mục tên đường
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`road_key` (PK)** | `BIGINT` | Khóa chính đại diện cho tên đường |
| `name` | `VARCHAR(100)` | Tên đường chính (ví dụ: "Đường Điện Biên Phủ") |
| `total_length_m` | `DECIMAL(10,2)` | Tổng chiều dài toàn bộ các tuyến mang tên này |
| `record_timestamp` | `TIMESTAMP` | Thời điểm cập nhật |

---

## 2. Strategic Management & Location Dimensions

### Bảng: `dim_corridor` – Hành lang giao thông trọng điểm
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`corridor_key` (PK)** | `BIGINT` | Khóa chính hành lang |
| `corridor_name` | `VARCHAR(255)` | Tên hành lang (ví dụ: "Hành lang Xa Lộ Hà Nội") |
| `importance_level` | `INT` | Mức độ ưu tiên quản lý (1–5) |
| `target_avg_speed` | `DECIMAL(5,2)` | Vận tốc mục tiêu thiết kế (km/h) |
| `total_length_m` | `DECIMAL(12,2)` | Tổng chiều dài hành lang |
| `direction` | `VARCHAR(10)` | Hướng lưu thông chính |
| `record_timestamp` | `TIMESTAMP` | Thời điểm cập nhật |

---

### Bảng: `bridge_corridor_segment` – Cầu nối Hành lang - Phân đoạn
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`corridor_key` (PK/FK)** | `BIGINT` | Khóa ngoại tới `dim_corridor` |
| **`segment_key` (PK/FK)** | `BIGINT` | Khóa ngoại tới `dim_segment` |
| `sequence_order` | `INT` | Thứ tự phân đoạn trên hành lang (1..N) |

---

### Bảng: `dim_location` – Vị trí hành chính
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`location_key` (PK)** | `BIGINT` | Khóa chính vị trí hành chính |
| `ward` | `VARCHAR(100)` | Tên Phường / Xã |
| `district` | `VARCHAR(100)` | Tên Quận / Huyện / TP Thủ Đức |
| `city` | `VARCHAR(100)` | Tên Thành phố ("Hồ Chí Minh") |
| `record_timestamp` | `TIMESTAMP` | Thời điểm cập nhật |

---

## 3. Temporal & Calendar Dimensions

### Bảng: `dim_date` – Ngày & Lịch
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`date_key` (PK)** | `INT` | Khóa số nguyên định dạng `YYYYMMDD` (ví dụ: `20260823`) |
| `month_year_key` (FK) | `INT` | Liên kết tháng năm `YYYYMM` |
| `full_date` | `DATE` | Ngày đầy đủ (`2026-08-23`) |
| `day_of_week` | `INT` | Thứ trong tuần (1 = Chủ Nhật .. 7 = Thứ Bảy) |
| `day_name_vi` | `VARCHAR(20)` | Tên thứ tiếng Việt ("Thứ Hai", "Chủ Nhật") |
| `iso_week` | `SMALLINT` | Số tuần ISO (1–53) |
| `is_weekend` | `BOOLEAN` | Ngày cuối tuần |
| `is_holiday` | `BOOLEAN` | Ngày lễ quốc gia |
| `is_end_of_month` | `BOOLEAN` | Ngày cuối cùng của tháng |

---

### Bảng: `dim_time_of_day` – Thời gian trong ngày
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`time_key` (PK)** | `INT` | Phút trong ngày ($0\dots1439$, ví dụ: $480 = \text{08:00}$) |
| `default_shift_key` (FK)| `INT` | Liên kết ca làm việc (`dim_shift`) |
| `hhmm` | `INT` | Định dạng số nguyên `HHMM` (ví dụ: `0830`) |
| `bucket_5min_key` | `INT` | Nhóm 5 phút |
| `bucket_15min_key` | `INT` | Nhóm 15 phút (khung crawl chính của IOC) |
| `bucket_60min_key` | `INT` | Khung 1 giờ |
| `is_business_hours` | `BOOLEAN` | Trong khung giờ hành chính (07:30 - 17:30) |

---

### Bảng: `dim_shift` – Ca làm việc
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`shift_key` (PK)** | `INT` | Khóa chính ca làm việc |
| `shift_code` | `VARCHAR(20)` | Mã ca (`S1`, `S2`, `S3`) |
| `shift_name_vi` | `VARCHAR(50)` | Tên ca ("Ca sáng", "Ca chiều", "Ca đêm") |
| `start_minute` | `SMALLINT` | Phút bắt đầu trong ngày |
| `end_minute` | `SMALLINT` | Phút kết thúc trong ngày |
| `is_business_shift` | `BOOLEAN` | Ca hành chính |
| `record_timestamp` | `TIMESTAMP` | Thời điểm cập nhật |

---

## 4. Contextual & Environmental Dimensions

### Bảng: `dim_weather` – Thời tiết & Môi trường
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| **`weather_key` (PK)** | `INT` | Khóa chính |
| `weather_id` | `INT` | Mã thời tiết chuẩn OpenWeatherMap (ví dụ: `500` = Light Rain, `211` = Thunderstorm) |
| `main_category` | `VARCHAR(50)` | Nhóm chính (`Rain`, `Clear`, `Clouds`, `Thunderstorm`, `Drizzle`, `Mist`) |
| `severity_level` | `INT` | Mức độ ảnh hưởng giao thông ($1 = \text{Nhẹ} \dots 5 = \text{Cực đoan}$) |
| `record_timestamp` | `TIMESTAMP` | Thời điểm cập nhật |
