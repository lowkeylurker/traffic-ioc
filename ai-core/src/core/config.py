"""
config.py - Cấu hình Ứng dụng

Sử dụng Pydantic BaseSettings để tải biến môi trường từ file .env.
Tất cả cấu hình được quản lý tập trung tại đây.

Bao gồm:
- CẤU HÌNH DATABASE (host, port, user, password, tên database)
- CẤU HÌNH API SERVICE (host, port, mức độ log)
- ĐƯỜNG DẪN MÔ HÌNH (forecast, RL, clustering models)
- CẤU HÌNH DỰ BÁO (horizon, cửa sổ lịch sử, cờ ensemble)
- CẤU HÌNH REINFORCEMENT LEARNING (thuật toán, ngưỡng, cửa sổ thời gian)
- CẤU HÌNH CLUSTERING (thuật toán, số lượng cluster, features, phương pháp imputation)
"""

# TODO: Triển khai lớp Pydantic Settings
