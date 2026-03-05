# Data Pipeline Module

Module ETL (Extract-Transform-Load) cho dự án **Smart Traffic IOC**, xây dựng theo
kiến trúc **DDD 4 tầng** (Core → Schemas → Utils → Pipelines). CLI sử dụng
[Typer](https://typer.tiangolo.com) cho phép chạy từng phase hoặc toàn bộ pipeline
bằng một lệnh duy nhất.

---

## 📁 Cấu trúc thư mục

```
data-pipeline/
├── .env                          # Biến môi trường (KHÔNG commit)
├── Dockerfile
├── requirements.txt
│
├── src/
│   ├── __init__.py
│   ├── main.py                   # ← Typer CLI entrypoint
│   │
│   ├── core/                     # Tầng Core (config, DB, logging, exceptions)
│   │   ├── __init__.py
│   │   ├── config.py             #   Pydantic Settings (.env loader)
│   │   ├── database.py           #   SQLAlchemy engine + health_check()
│   │   ├── exceptions.py         #   PipelineError hierarchy
│   │   └── logger.py             #   Rotating file + console logger
│   │
│   ├── schemas/                  # Tầng Schemas (Pydantic V2 data contracts)
│   │   ├── __init__.py
│   │   ├── tomtom_schema.py      #   FlowSegmentResponse, IncidentResponse
│   │   ├── weather_schema.py     #   CurrentWeatherResponse
│   │   └── osm_schema.py         #   OverpassElement, highway tags
│   │
│   ├── utils/                    # Tầng Utils (pure functions)
│   │   ├── __init__.py
│   │   ├── math_calc.py          #   LOS grade, PCU, congestion_index
│   │   ├── weather_mapping.py    #   OWM code → weather_key + category
│   │   └── geo_ops.py            #   Haversine, bearing, WGS-84 ↔ VN-2000
│   │
│   └── pipelines/                # Tầng Pipelines (ETL orchestration)
│       ├── __init__.py
│       ├── base.py               #   BasePipeline (extract → transform → load)
│       │
│       ├── static_dims/          # Phase 1 – Dimension thời gian
│       │   ├── __init__.py
│       │   ├── date_time_pipeline.py
│       │   └── holiday_pipeline.py
│       │
│       ├── spatial_net/          # Phase 2 – Mạng lưới đường (OSM)
│       │   ├── __init__.py
│       │   ├── osm_pipeline.py
│       │   └── location_pipeline.py
│       │
│       ├── real_time/            # Phase 3 – Dữ liệu thời gian thực
│       │   ├── __init__.py
│       │   ├── weather_pipeline.py
│       │   ├── traffic_pipeline.py
│       │   └── incident_pipeline.py
│       │
│       └── ml_features/          # Phase 4 – Batch nightly
│           ├── __init__.py
│           ├── baseline_pipeline.py
│           └── corridor_pipeline.py
│
├── specs/                        # Tài liệu thiết kế (DDD specs)
├── tests/
├── cache/
└── data/
```

**Tổng cộng: 30 source files** (đã verified `py_compile` OK).

---

## 🔧 Yêu cầu hệ thống

| Thành phần          | Version tối thiểu    |
|---------------------|----------------------|
| Python              | 3.9+                 |
| PostgreSQL + PostGIS| 15 + 3.3             |
| Docker & Compose    | 24.x / 2.x          |
| GDAL / PROJ / GEOS  | (đã cài sẵn trong Dockerfile) |

---

## ⚙️ Cấu hình môi trường

Tạo file `data-pipeline/.env`:

```dotenv
# ── Database ──────────────────────────────────────────────
DB_HOST=localhost          # Nếu chạy trong Docker → "postgres"
DB_PORT=5432
DB_NAME=traffic_ioc_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSLMODE=disable

# ── API Keys ──────────────────────────────────────────────
TOMTOM_API_KEY=your_tomtom_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
SERPAPI_KEY=your_serpapi_key         # dùng cho holiday lookup

# ── Logging (tuỳ chọn) ───────────────────────────────────
LOG_LEVEL=INFO                      # DEBUG | INFO | WARNING | ERROR
LOG_DIR=                            # Để trống → chỉ console; đặt path → ghi file
```

> **Lưu ý Docker:** Khi chạy qua `docker-compose`, `DB_HOST` phải là `postgres`
> (tên service trong compose), không phải `localhost`.

---

## 🚀 Cài đặt

### Cách 1: Chạy trực tiếp (local)

```bash
cd data-pipeline

# Tạo virtual environment
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### Cách 2: Chạy qua Docker Compose (khuyến nghị)

```bash
# Từ thư mục gốc project (chứa docker-compose.yml)
docker-compose up -d --build postgres data-pipeline
```

Container `utraffic-data-pipeline` sẽ start và giữ sống (`tail -f /dev/null`),
chờ bạn exec lệnh ETL vào.

---

## 🖥️ CLI – Các lệnh ETL

Entrypoint: `python -m src.main <command>`

| Lệnh            | Mô tả                                              | Cron gợi ý      |
|------------------|-----------------------------------------------------|------------------|
| `health`         | Kiểm tra kết nối PostgreSQL                        | –                |
| `run-static`     | Phase 1: Sinh dimension thời gian + ngày lễ        | Chạy 1 lần / setup |
| `run-spatial`    | Phase 2: OSM network + spatial dims + priority corridors | Chạy 1 lần / setup |
| `run-realtime`   | Phase 3: Weather → Traffic Flow → Incident (1 cycle)| `*/15 * * * *`   |
| `run-batch`      | Phase 4: Baseline speed + corridor performance      | `0 2 * * *`      |
| `run-all`        | Chạy Phase 1 → 2 → 3 → 4 tuần tự                  | Lần chạy đầu     |

### Chạy local

```bash
cd data-pipeline

# Kiểm tra kết nối DB
python -m src.main health

# Chạy từng phase
python -m src.main run-static
python -m src.main run-spatial
python -m src.main run-realtime
python -m src.main run-batch

# Hoặc chạy tất cả
python -m src.main run-all

# Xem help
python -m src.main --help
python -m src.main run-static --help
```

### Chạy qua Docker

```bash
# Kiểm tra kết nối
docker-compose exec data-pipeline python -m src.main health

# Chạy toàn bộ pipeline
docker-compose exec data-pipeline python -m src.main run-all

# Chạy riêng phase thời gian thực
docker-compose exec data-pipeline python -m src.main run-realtime

# Xem logs (nếu LOG_DIR được set)
docker-compose exec data-pipeline cat /app/logs/pipeline.log
```

---

## 🔄 Thứ tự chạy Pipeline (FK dependencies)

Pipeline **phải** chạy theo đúng thứ tự để đảm bảo Foreign Key:

```
Phase 1: run-static
  └─ dim_month_year → dim_shift → dim_date → dim_time_of_day
     → dim_holiday → bridge_date_holiday

Phase 2: run-spatial
  └─ dim_location → dim_node → dim_road → dim_way → dim_segment
     → dim_corridor → bridge_corridor_segment

Phase 3: run-realtime  (phụ thuộc Phase 1 + 2)
  └─ dim_weather → fact_traffic_flow → fact_incident

Phase 4: run-batch  (phụ thuộc Phase 3)
  └─ fact_baseline_speed → fact_corridor_performance
```

**Lần đầu tiên:** Chạy `run-all` để populate theo đúng thứ tự.

**Hàng ngày:** Chỉ cần schedule `run-realtime` (mỗi 15 phút)
và `run-batch` (1 lần/đêm).

---

## 🏗️ Kiến trúc 4 tầng DDD

```
┌───────────────────────────────────────────────┐
│  main.py  (Typer CLI – orchestration)         │
├───────────────────────────────────────────────┤
│  pipelines/   (ETL: extract → transform →     │
│                load cho từng domain)           │
├───────────────────────────────────────────────┤
│  schemas/     (Pydantic V2 data contracts –   │
│                validate API responses)         │
├───────────────────────────────────────────────┤
│  utils/       (Pure functions – math, geo,    │
│                weather mapping)                │
├───────────────────────────────────────────────┤
│  core/        (Config, Database engine,       │
│                Logger, Exceptions)             │
└───────────────────────────────────────────────┘
```

Mỗi pipeline kế thừa `BasePipeline` (template method):

```python
class BasePipeline:
    def run(self):
        raw  = self.extract()       # Gọi API / Generate
        rows = self.transform(raw)  # Validate + convert
        n    = self.load(rows)      # UPSERT vào PostgreSQL
        return n
```

---

## 📊 Pipeline Domains

### Phase 1 – Static Dimensions (`static_dims/`)

| Pipeline             | Tables                                     | Nguồn           |
|----------------------|---------------------------------------------|------------------|
| `date_time_pipeline` | `dim_month_year`, `dim_shift`, `dim_date`, `dim_time_of_day` | Generate (2020–2030) |
| `holiday_pipeline`   | `dim_holiday`, `bridge_date_holiday`        | SerpAPI + hardcode |

### Phase 2 – Spatial Network (`spatial_net/`)

| Pipeline             | Tables                                      | Nguồn      |
|----------------------|----------------------------------------------|------------|
| `location_pipeline`  | `dim_location`                               | Hardcode catalog |
| `osm_pipeline`       | `dim_node`, `dim_road`, `dim_way`, `dim_segment` | Overpass API |
| `corridor_pipeline`  | `dim_corridor`, `bridge_corridor_segment`    | Ranking từ DB (traffic + incident + hạ tầng) |

**Corridor Selection Strategy (mới):**
- Không còn tạo corridor cho mọi road.
- Chỉ chọn các tuyến trọng yếu theo điểm ưu tiên đa yếu tố: lưu lượng (`pcu_volume`), mức tắc (`traffic_index`), tần suất sự cố (`fact_incident`), và mức quan trọng hạ tầng (FRC/làn/arterial type).
- Kết quả là tập corridor ưu tiên (mặc định top 40), sau đó nạp toàn bộ segment tương ứng vào `bridge_corridor_segment` theo `sequence_order`.

### Phase 3 – Real-Time (`real_time/`)

| Pipeline             | Tables              | Nguồn              | Tần suất    |
|----------------------|----------------------|---------------------|-------------|
| `weather_pipeline`   | `dim_weather`       | OpenWeather API     | 15 phút     |
| `traffic_pipeline`   | `fact_traffic_flow` | TomTom Flow API     | 15 phút     |
| `incident_pipeline`  | `fact_incident`     | TomTom Incident API | 15 phút     |

### Phase 4 – ML Features (`ml_features/`)

| Pipeline              | Tables                      | Nguồn            | Tần suất  |
|-----------------------|-----------------------------|-------------------|-----------|
| `baseline_pipeline`   | `fact_baseline_speed`       | Aggregate từ DB  | Nightly   |
| `corridor_pipeline`   | `fact_corridor_performance` | Aggregate từ DB  | Nightly   |

---

## 📚 Đăng ký API Keys

| API            | Đăng ký                                    | Mục đích                    |
|----------------|--------------------------------------------|-----------------------------|
| TomTom         | https://developer.tomtom.com               | Traffic Flow + Incidents    |
| OpenWeather    | https://openweathermap.org/api             | Current Weather             |
| SerpAPI        | https://serpapi.com                         | Holiday lookup (Google)     |

---

## 🔒 Bảo mật

- **KHÔNG** commit file `.env` vào Git (đảm bảo có trong `.gitignore`)
- Luôn dùng biến môi trường cho passwords & API keys
- Tất cả API keys chỉ nằm trong `Settings` (Pydantic), không hardcode
- Connection string được tự động build từ biến DB_* trong `config.py`

---

## 🐛 Troubleshooting

| Vấn đề                            | Giải pháp                                                     |
|------------------------------------|---------------------------------------------------------------|
| `Database connection FAILED`       | Kiểm tra `.env`, đảm bảo PostgreSQL đang chạy               |
| `DB_HOST=localhost` trong Docker   | Đổi thành `DB_HOST=postgres` (tên service trong compose)     |
| `ModuleNotFoundError: pydantic_settings` | `pip install pydantic-settings>=2.0`                   |
| `GDAL/GEOS not found`             | Chạy qua Docker (đã cài sẵn) hoặc cài system libs           |
| FK violation khi `run-realtime`    | Chạy `run-static` và `run-spatial` trước                     |
| API rate limit                     | Các pipeline dùng `tenacity` retry tự động (exponential backoff) |

---

## 📝 Quy tắc Phát triển

- Database: `snake_case` naming cho tables & columns
- Python: `snake_case` hàm/biến, `PascalCase` class
- Mỗi pipeline file export hàm `run(engine) → int` (số records affected)
- Validate mọi API response qua Pydantic schema trước khi transform
- DRY, KISS — comments giải thích "Why" không phải "What"

---

Last Updated: Jun 2025
