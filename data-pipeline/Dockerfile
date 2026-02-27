# Sử dụng Python 3.9 slim để cân bằng giữa dung lượng và tính ổn định
FROM python:3.9-slim-bullseye

# 1. Thiết lập biến môi trường
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV DEBIAN_FRONTEND noninteractive

# 2. Thiết lập thư mục làm việc
WORKDIR /app

# 3. Cài đặt các thư viện hệ thống cần thiết cho Geospatial (GDAL, PROJ, GEOS)
# Đây là bước quan trọng để tránh lỗi khi chạy osmnx/geopandas
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgdal-dev \
    libproj-dev \
    libgeos-dev \
    binutils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 4. Copy và cài đặt Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 5. Copy toàn bộ mã nguồn vào container
COPY . .

# Mặc định khi khởi động sẽ không làm gì cả để tránh tốn tài nguyên
# Bạn sẽ dùng docker-compose exec để chạy các script lẻ
CMD ["tail", "-f", "/dev/null"]