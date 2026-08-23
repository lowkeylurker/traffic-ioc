# OpenSpec: Project Initialization Structure

Dưới đây là cấu trúc Monorepo cho dự án "Smart Traffic IOC". Hãy khởi tạo các thư mục và file rỗng (hoặc kèm nội dung boilerplate cơ bản) theo cây thư mục sau.

## Root Directory
Root: `./`

### 1. Root Configuration files
- `.gitignore`: Cấu hình ignore cho Node, Python, System files, `.env`.
- `README.md`: Tài liệu hướng dẫn cài đặt chung (Link tới project.md).
- `docker-compose.yml`: File cấu hình Docker để chạy PostgreSQL/PostGIS local (dành cho dev mode).
- `.env.example`: Template chứa các biến môi trường chung (DB_HOST, API_KEYS).

### 2. Infrastructure (Dành cho DE - Cấu hình hạ tầng)
Path: `infrastructure/`
- `postgres/`
    - `init.sql`: Script SQL tạo Schema (DDL) cho các bảng Fact và Dim.
    - `seed_data.sql`: Script insert dữ liệu mẫu cho dim_time, dim_date.
- `mock-data/`: Thư mục chứa các file CSV/JSON giả lập (để test khi không có API).

### 3. Data Pipeline (Dành cho DE - Mã nguồn ETL)
Path: `data-pipeline/`
- `requirements.txt`: Danh sách thư viện Python (pandas, psycopg2, osmnx...).
- `.env`: Config riêng cho Python (DB Creds).
- `src/`
    - `config.py`: Class quản lý kết nối DB.
    - `extractors/`:
        - `tomtom_api.py`: Script gọi API TomTom.
        - `weather_api.py`: Script gọi API OpenWeather.
    - `transformers/`:
        - `calc_los.py`: Hàm tính toán mức độ tắc nghẽn.
        - `calc_pcu.py`: Hàm quy đổi PCU.
    - `loaders/`:
        - `db_loader.py`: Hàm insert/upsert vào PostgreSQL.
    - `main_etl.py`: Script entry point để chạy toàn bộ luồng.

### 4. AI Core (Dành cho SE1/AI - Model & Training)
Path: `ai-core/`
- `requirements.txt`: Thư viện AI (ultralytics, scikit-learn, numpy...).
- `notebooks/`: Thư mục chứa Jupyter Notebook dùng để EDA và Train model.
    - `traffic_forecast_experiment.ipynb`
- `models/`: Thư mục lưu file model đã train (.pt, .pkl).
    - `.keep`: Giữ thư mục (Git).
- `src/`:
    - `vehicle_counter.py`: Script sử dụng YOLOv8 để đếm xe từ ảnh/video.
    - `forecast_service.py`: Microservice nhỏ (Flask/FastAPI) để serve model dự báo.

### 5. Backend (Dành cho SE1 - Node.js API)
Path: `backend/`
- `package.json`: Dependencies (express/nestjs, typeorm, pg...).
- `tsconfig.json`: Cấu hình TypeScript.
- `.env`: Config riêng cho Backend.
- `src/`
    - `main.ts`: Entry point của Server.
    - `app.module.ts`: (Nếu dùng NestJS) hoặc `app.ts` (Express).
    - `modules/` (Cấu trúc theo Feature):
        - `map/`: (Controller, Service lấy GeoJSON segment).
        - `traffic/`: (Controller, Service lấy dữ liệu LOS, Speed).
        - `analytics/`: (Controller, Service lấy dữ liệu thống kê).
        - `alert/`: (Controller, Service lấy cảnh báo).
    - `common/`: Các ultilities, constants, database config.

### 6. Frontend (Dành cho SE2 - React Web App)
Path: `frontend/`
- `package.json`: Dependencies (react, vite, mapbox-gl, chart.js...).
- `vite.config.ts`: Cấu hình Build tool.
- `.env`: Config API URL.
- `src/`
    - `App.tsx`: Main component.
    - `main.tsx`: Entry point.
    - `assets/`: Images, Icons, Global CSS.
    - `components/`: Các UI Component tái sử dụng.
        - `map/`: `TrafficMap.tsx`, `HeatmapLayer.tsx`.
        - `charts/`: `VehiclePieChart.tsx`, `SpeedLineChart.tsx`.
        - `widgets/`: `WeatherWidget.tsx`, `AlertList.tsx`.
    - `pages/`: Các trang chính.
        - `DashboardPage.tsx`
        - `AnalyticsPage.tsx`
    - `services/`: Axios config và các hàm gọi API Backend.
