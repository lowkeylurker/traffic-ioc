# 1. Chọn hệ điều hành cơ sở có sẵn Python 3.9
FROM python:3.9-slim

# 2. Cài đặt các công cụ cần thiết để biên dịch C++ (CityFlow yêu cầu)
# Chúng ta cài build-essential (trình biên dịch), cmake và git
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# 3. Thiết lập thư mục làm việc trong "hộp" Docker
WORKDIR /app

# 4. Copy tệp requirements.txt vào trước để cài thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Tải và Build CityFlow từ mã nguồn
RUN git clone https://github.com/cityflow-project/CityFlow.git \
    && cd CityFlow \
    && mkdir build && cd build \
    && cmake .. \
    && make -j$(nproc) \
    && cd .. && pip install .

# 6. Copy toàn bộ code từ máy bạn vào trong Docker
COPY . .

# 7. Lệnh khởi chạy (ở đây dùng FastAPI như bạn đã khai báo trong requirements)
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]