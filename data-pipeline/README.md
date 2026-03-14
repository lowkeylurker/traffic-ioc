# Data Pipeline Module

Đây là module ETL (Extract-Transform-Load) cho dự án Smart Traffic IOC.

## 📁 Cấu trúc

```
data-pipeline/
├── src/
│   ├── config.py                # Database configuration
│   ├── extractors/
│   │   ├── tomtom_api.py       # TomTom API integration
│   │   └── weather_api.py      # OpenWeather API integration
│   ├── transformers/
│   │   ├── calc_los.py         # LOS & PCU calculations
│   │   └── calc_pcu.py         # PCU calculations
│   ├── loaders/
│   │   └── db_loader.py        # Database insert/upsert
│   └── main_etl.py             # ETL orchestration
├── requirements.txt             # Python dependencies
└── README.md                    # This file
```

## 🚀 Cài đặt & Chạy

### Cài đặt Python packages

```bash
pip install -r requirements.txt
```

### Cấu hình môi trường

Tạo file `.env` trong thư mục này với các biến:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=traffic_ioc_db
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSLMODE=disable

TOMTOM_API_KEY=your_tomtom_key
OPENWEATHER_API_KEY=your_weather_key
```

### Chạy ETL Pipeline

```bash
# Chạy toàn bộ pipeline
python src/main_etl.py

# Test individual modules
python src/extractors/tomtom_api.py
python src/extractors/weather_api.py
python src/transformers/calc_los.py
python src/loaders/db_loader.py
```

## 📊 Modules

### Extractors (Lấy dữ liệu)

- **tomtom_api.py**: Lấy dữ liệu giao thông từ TomTom API
  - Tốc độ hiện tại, tốc độ tự do
  - Thời gian di chuyển
  
- **weather_api.py**: Lấy dữ liệu thời tiết từ OpenWeather
  - Nhiệt độ, độ ẩm
  - Lượng mưa, tầm nhìn
  - Tốc độ gió

### Transformers (Xử lý dữ liệu)

- **calc_los.py**: Tính toán Level of Service (LOS) từ A-F
  - Dựa trên tỷ lệ tốc độ hiện tại vs tốc độ tự do
  - PCU (Passenger Car Unit) - quy đổi các loại xe khác nhau
  
### Loaders (Lưu dữ liệu)

- **db_loader.py**: Insert/Update dữ liệu vào PostgreSQL
  - Upsert traffic flow data
  - Insert incidents
  - Insert forecasts

## 🔒 Security

⚠️ **QUAN TRỌNG:**
- KHÔNG commit file `.env` vào Git
- Luôn sử dụng biến môi trường cho passwords & API keys
- Kiểm tra `.gitignore` để đảm bảo `.env` được ignore

## 📚 API Keys

### TomTom API
- Đăng ký tại: https://developer.tomtom.com
- Sử dụng cho Traffic Flow API

### OpenWeather API
- Đăng ký tại: https://openweathermap.org/api
- Sử dụng cho Current Weather API

## 📝 Quy tắc Phát triển

Tuân thủ các rule được định nghĩa trong [AGENTS.md](../../openspec/specs/AGENTS.md):
- Database: `snake_case` naming
- Python: `snake_case` hàm/biến, `PascalCase` class
- DRY, KISS principles
- Comments giải thích "Why" không phải "What"

---

Last Updated: Jan 2026
