# AI Core - Traffic AI & CV Module

Module này là phần AI cho dự án Traffic IOC, gồm dự báo giao thông và nhận diện/đếm phương tiện. Mục tiêu là cung cấp service dự báo và pipeline CV, sẵn sàng tích hợp với backend và chạy trong Docker.

## ✅ Những gì đã thực hiện

- Tạo cấu trúc module AI độc lập trong ai-core.
- Chuẩn bị requirements.txt để quản lý phụ thuộc Python.
- Khai báo khung (placeholder) cho 2 thành phần chính:
	- forecast_service.py: service dự báo giao thông.
	- vehicle_counter.py: đếm phương tiện từ ảnh/video.
- Chuẩn bị thư mục models/ để lưu model đã train (gitignored).
- Viết README hướng dẫn sử dụng và tích hợp.
- Thiết kế hướng khởi chạy qua Docker Compose cùng hệ thống tổng (xem hướng dẫn bên dưới).

## 📁 Cấu trúc thư mục

```
ai-core/
├── Dockerfile
├── README.md
├── requirements.txt
├── models/                 # nơi lưu model đã train (gitignored)
└── src/
		├── forecast_service.py # placeholder cho API dự báo
		├── main.py             # entrypoint (nếu dùng Docker)
		├── vehicle_counter.py  # placeholder cho CV/YOLO
		└── README.md           # hướng dẫn cho simulation/CityFlow
```

## 🚀 Chạy module

### 1) Chạy bằng Docker (khuyến nghị)

Chạy service AI cùng toàn bộ hệ thống từ thư mục gốc:

```
docker-compose up -d ai-core
```

### 2) Chạy trực tiếp bằng Python

```
pip install -r requirements.txt
python src/forecast_service.py
```

## 🔧 Biến môi trường gợi ý

Các biến sau sẽ dùng cho service dự báo khi triển khai thực tế:

```
AI_SERVICE_PORT=5000
AI_MODEL_PATH=./models/
```

## 📌 Trạng thái hiện tại của mã nguồn

- forecast_service.py và vehicle_counter.py đang ở dạng placeholder (chưa triển khai logic).
- Các thành phần sẽ được hoàn thiện khi có dữ liệu training và thiết kế API chi tiết.
- Việc tích hợp với backend sẽ dựa trên các endpoint được định nghĩa trong future sprint.

## 📚 Ghi chú

- models/ không commit vào git.
- main.py là entrypoint cho Docker nếu cần chạy trực tiếp trong container.
- Tài liệu bổ sung cho CityFlow/simulation nằm ở src/README.md.

---

Last Updated: Jan 2026
