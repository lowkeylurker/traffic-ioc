# Thiết kế Dimension Tables – Phase 1

## 1. Nhóm Dimension Hạ tầng Giao thông (Road Infrastructure)

### Bảng: `dim_node` – Điểm nút giao thông

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **node_key (PK)** | BIGINT | Khóa chính đại diện cho một nút giao hoặc điểm tọa độ |
| node_source_id | BIGINT | ID định danh từ nguồn dữ liệu gốc (ví dụ: osmid) |
| is_snapped | BOOLEAN | Nút đã được khớp chính xác vào đường giao thông hay chưa |
| node_type | VARCHAR(30) | Loại nút: signalized, intersection, terminal |
| geometry | GEOMETRY | Tọa độ không gian (Point) của nút giao |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm bản ghi được tạo hoặc cập nhật |

---

### Bảng: `dim_segment` – Phân đoạn đường chi tiết

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **segment_key (PK)** | BIGINT | Khóa chính cho từng đoạn đường nhỏ nhất |
| from_node_key (FK) | BIGINT | Nút giao bắt đầu |
| to_node_key (FK) | BIGINT | Nút giao kết thúc |
| way_key (FK) | BIGINT | Liên kết tới tuyến đường |
| location_key (FK) | INT | Liên kết tới vị trí hành chính |
| segment_id_source | BIGINT | ID đoạn đường từ nguồn (TomTom/OSM) |
| length_m | DECIMAL(10,2) | Chiều dài phân đoạn (mét) |
| geometry_center | GEOMETRY(Point, 4326) | Tọa độ trung tâm đoạn đường |
| geometry_linestring | GEOMETRY(LineString, 4326) | Hình dạng vector đoạn đường |
| is_one_way | BOOLEAN | Đường một chiều hay hai chiều |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm ghi nhận dữ liệu |

---

### Bảng: `dim_way` – Thông số kỹ thuật tuyến đường

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **way_key (PK)** | BIGINT | Khóa chính nhóm các đoạn đường |
| road_key (FK) | BIGINT | Liên kết tên đường |
| total_length_m | DECIMAL(10,2) | Tổng chiều dài tuyến |
| direction | VARCHAR(20) | Hướng di chuyển (Forward/Backward/Both) |
| segment_count | INT | Số segment |
| default_lane_count | INT | Số làn mặc định |
| design_capacity | INT | Sức chứa thiết kế |
| default_speed_limit | INT | Giới hạn tốc độ |
| tomtom_frc | TINYINT | Phân loại cấp đường TomTom (0–6) |
| osm_highway_type | VARCHAR(30) | Phân loại theo OSM |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm cập nhật |

---

### Bảng: `dim_road` – Danh mục tên đường

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **road_key (PK)** | BIGINT | Khóa chính |
| name | VARCHAR(100) | Tên đường |
| total_length_m | DECIMAL(10,2) | Tổng chiều dài |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm cập nhật |

---

## 2. Nhóm Dimension Quản lý & Vị trí (Management & Location)

### Bảng: `dim_corridor` – Hành lang giao thông

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **corridor_key (PK)** | BIGINT | Khóa chính |
| corridor_name | VARCHAR(255) | Tên hành lang |
| importance_level | INT | Mức ưu tiên quản lý |
| target_avg_speed | DECIMAL(5,2) | Vận tốc mục tiêu |
| total_length_m | DECIMAL(12,2) | Tổng chiều dài |
| direction | VARCHAR(10) | Hướng di chuyển |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm cập nhật |

---

### Bảng: `bridge_corridor_segment`

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| corridor_key (PK/FK) | BIGINT | Liên kết hành lang |
| segment_key (PK/FK) | BIGINT | Liên kết đoạn đường |
| sequence_order | INT | Thứ tự đoạn trên hành lang |

---

### Bảng: `dim_location` – Vị trí hành chính

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **location_key (PK)** | BIGINT | Khóa chính |
| ward | VARCHAR(100) | Phường |
| district | VARCHAR(100) | Quận |
| city | VARCHAR(100) | Thành phố |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm cập nhật |

---

## 3. Nhóm Dimension Thời gian (Time & Calendar)

### Bảng: `dim_date`

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **date_key (PK)** | INT | YYYYMMDD |
| month_year_key (FK) | INT | Liên kết tháng/năm |
| full_date | DATE | Ngày đầy đủ |
| day_of_week | INT | Thứ trong tuần (1–7) |
| day_name_vi | STRING | Tên ngày |
| iso_week | SMALLINT | Tuần ISO |
| is_weekend | BOOLEAN | Cuối tuần |
| is_holiday | BOOLEAN | Ngày lễ |
| is_end_of_month | BOOLEAN | Cuối tháng |

---

### Bảng: `dim_time_of_day`

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **time_key (PK)** | INT | Phút trong ngày (0–1439) |
| default_shift_key (FK) | INT | Ca làm việc |
| hhmm | INT | HHMM |
| bucket_5min_key | INT | Nhóm 5 phút |
| bucket_15min_key | INT | Nhóm 15 phút |
| bucket_60min_key | INT | Nhóm 60 phút |
| is_business_hours | BOOLEAN | Giờ hành chính |

---

### Bảng: `dim_shift`

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **shift_key (PK)** | INT | Khóa chính |
| shift_code | VARCHAR | Mã ca |
| shift_name_vi | VARCHAR | Tên ca |
| start_minute | SMALLINT | Bắt đầu |
| end_minute | SMALLINT | Kết thúc |
| is_business_shift | BOOLEAN | Ca hành chính |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm cập nhật |

---

### Bảng: `dim_month_year`

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **month_year_key (PK)** | INT | Khóa chính |
| month_number | INT | Tháng (1–12) |
| month_name_vi | STRING | Tên tháng |
| month_start_date | DATE | Ngày bắt đầu |
| month_end_date | DATE | Ngày kết thúc |
| days_in_month | INT | Số ngày |
| quarter_number | INT | Quý |
| quarter_name | STRING | Tên quý |
| year | INT | Năm |
| days_in_year | INT | Tổng ngày |
| is_leap_year | BOOLEAN | Năm nhuận |

---

### Bảng: `dim_holiday`

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **holiday_key (PK)** | INT | Khóa chính |
| holiday_name_vi | VARCHAR | Tên ngày lễ |
| duration_days | INT | Số ngày |
| is_public_holiday | BOOLEAN | Lễ quốc gia |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm cập nhật |

---

### Bảng: `bridge_date_holiday`

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| date_key (PK/FK) | INT | Ngày |
| holiday_key (PK/FK) | INT | Lễ |

---

## 4. Nhóm Dimension Bối cảnh (Contextual)

### Bảng: `dim_weather`

| Tên | Kiểu dữ liệu | Giải thích |
|----|-------------|-----------|
| **weather_key (PK)** | INT | Khóa chính |
| weather_id | INT | ID thời tiết |
| main_category | VARCHAR(50) | Nhóm thời tiết |
| severity_level | INT | Mức ảnh hưởng |
| record_timestamp (SCD) | TIMESTAMP | Thời điểm cập nhật |