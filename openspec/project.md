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
- `fact_traffic_flow`: Lưu lượng, tốc độ, LOS (cập nhật 15p/lần).
- `fact_incident`: Sự cố giao thông (tai nạn, ngập).
- `fact_weather_impact`: Tác động thời tiết lên hạ tầng.

### Bảng Dimension (Chiều)
- `dim_time`, `dim_date`: Thời gian chuẩn hóa.
- `dim_segment`: Đoạn đường (LineString) từ OSM.
- `dim_location`: Đơn vị hành chính (Quận/Phường).
- `dim_vehicle_type`: Loại xe & hệ số PCU.

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
