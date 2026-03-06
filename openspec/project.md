# Project: Smart Traffic IOC (Intelligent Operations Center)

## 1. Tổng quan
Hệ thống Kho dữ liệu và Điều hành giao thông thông minh phục vụ Sở GTVT TP.HCM. Hệ thống tích hợp dữ liệu đa nguồn (Camera AI, API TomTom, Thời tiết), lưu trữ tập trung và cung cấp các công cụ giám sát, phân tích, dự báo và hỗ trợ ra quyết định.

- **Stakeholder chính:** Sở GTVT TP.HCM.
- **Mô hình triển khai:** Monorepo.
- **Thời gian thực hiện:** 12 tuần (6 Sprints).

## 2. Tech Stack & Hạ tầng

### Hạ tầng (Infrastructure)
- **Cloud:** Azure Database for PostgreSQL (Flexible Server).
- **Database:** PostgreSQL 15+ tích hợp PostGIS extension.
- **Containerization:** Docker & Docker Compose (cho môi trường local development).

### Data Engineering (DE)
- **Language:** Python 3.10+.
- **Libraries:** Pandas, Psycopg2, SQLAlchemy, OSMnx, Pyproj.
- **Scheduling:** Windows Task Scheduler / Cronjob (Local runner).

### Artificial Intelligence (AI)
- **Computer Vision:** YOLOv8 (Pre-trained model từ Ultralytics).
- **Forecasting:** Scikit-learn (Linear Regression/Random Forest).
- **Language:** Python.

### Backend (BE)
- **Runtime:** Node.js 18+ (TypeScript).
- **Framework:** Express.js.
- **ORM:** Prisma.
- **Documentation:** Swagger/OpenAPI.

### Frontend (FE)
- **Framework:** ReactJS 18+ (Vite).
- **Map Library:** Mapbox GL JS hoặc React-Map-GL.
- **Charts:** Chart.js hoặc Recharts.
- **UI Kit:** Ant Design hoặc TailwindCSS.

## 3. Kiến trúc Dữ liệu (Galaxy Schema)

### Bảng Fact (Sự kiện)
- `fact_traffic_flow`: Dòng chảy giao thông – lưu lượng PCU, tốc độ, LOS, congestion_level (cập nhật 15p/lần). **Partitioned theo tháng**.
- `fact_incident`: Sự cố giao thông – tai nạn, ngập, roadwork, severity 1–5. **Partitioned theo tháng**.
- `fact_event`: Sự kiện xã hội – concert, sport, festival với bán kính ảnh hưởng.
- `fact_traffic_risk_prediction`: Dự báo rủi ro – predicted_risk_score, confidence_level, model_version. **Partitioned theo tháng**.
- `fact_simulation_scenario`: Kịch bản giả lập CityFlow – sim_avg_speed, improvement_pct.
- `fact_corridor_performance`: Hiệu suất hành lang – TTI, corridor_efficiency, bottleneck.

### Bảng Dimension (Chiều)

#### Nhóm Hạ tầng Giao thông (Road Infrastructure)
- `dim_node`: Điểm nút giao thông (Point geometry).
- `dim_segment`: Phân đoạn đường chi tiết (LineString geometry) từ OSM/TomTom.
- `dim_way`: Thông số kỹ thuật tuyến đường (lane_count, speed_limit, tomtom_frc).
- `dim_road`: Danh mục tên đường.

#### Nhóm Quản lý & Vị trí (Management & Location)
- `dim_corridor`: Hành lang giao thông trọng điểm.
- `bridge_corridor_segment`: Cầu nối N-N Hành lang ↔ Đoạn đường (có thứ tự).
- `dim_location`: Đơn vị hành chính (Phường/Quận/Thành phố).

#### Nhóm Thời gian & Lịch (Time & Calendar)
- `dim_date`: Ngày (Smart Key YYYYMMDD, weekend, holiday).
- `dim_time_of_day`: Phút trong ngày (0–1439), bucket 5/15/60 phút.
- `dim_shift`: Ca làm việc (sáng, chiều, đêm).
- `dim_month_year`: Phân cấp tháng/năm/quý.
- `dim_holiday`: Danh mục ngày lễ.
- `bridge_date_holiday`: Cầu nối N-N Ngày ↔ Ngày lễ.

#### Nhóm Bối cảnh (Contextual)
- `dim_weather`: Thời tiết (main_category, severity_level).

## 4. Danh sách Nghiệp vụ (Core Features)

### Nhóm Giám sát (Descriptive)
- **A1:** Bản đồ tốc độ thời gian thực (Tô màu Xanh/Vàng/Đỏ).
- **A2:** Cảnh báo tắc nghẽn (Tính toán LOS E/F).
- **A5:** Heatmap điểm đen sự cố.
- **A6:** Cảnh báo tác động thời tiết (Mưa vs Tốc độ).
- **A9:** Thống kê cơ cấu phương tiện (Xe máy/Ô tô/Tải).

### Nhóm Phân tích (Diagnostic)
- **A3:** So sánh tốc độ hiện tại vs Trung bình quá khứ (Baseline).
- **A4:** Bảng xếp hạng độ tin cậy tuyến đường (Buffer Index).

### Nhóm Dự báo & Điều hành (Predictive & Prescriptive)
- **B1:** Dự báo tốc độ 60 phút tới (Short-term forecast).
- **B3:** Bản đồ rủi ro động (Dynamic Risk Map).
- **C1:** Mô phỏng phân luồng (Giả lập chặn đường & Tìm đường tránh).

## 5. Quy ước (Conventions)

### Naming Convention
| Đối tượng | Quy tắc | Ví dụ |
| :--- | :--- | :--- |
| **Database Table** | snake_case, số ít | `dim_segment`, `fact_traffic_flow` |
| **DB Column** | snake_case | `current_speed`, `created_at` |
| **API Endpoint** | kebab-case, nouns | `/api/v1/traffic-flow`, `/api/v1/segments` |
| **JSON Response** | camelCase | `{ "currentSpeed": 40, "segmentId": 1 }` |
| **Variable (JS)** | camelCase | `const segmentData = ...` |
| **Variable (Python)**| snake_case | `df_traffic = pd.read_sql(...)` |
| **React Component**| PascalCase | `TrafficMap.tsx`, `Sidebar.tsx` |

### Git Flow
- **Main Branch:** `main` (Code ổn định, demo được).
- **Feature Branch:** `feature/<tên-module>/<tên-tính-năng>`
    - VD: `feature/de/etl-tomtom`, `feature/be/api-login`, `feature/fe/map-view`.
- **Commit Message:** `[ROLE] <Action>: <Description>`
    - VD: `[DE] Add: ETL script for weather data`, `[FE] Fix: Map zoom level bug`.

### Code Style
- **JS/TS:** Sử dụng Prettier & ESLint (Standard config).
- **Python:** Tuân thủ PEP 8.
