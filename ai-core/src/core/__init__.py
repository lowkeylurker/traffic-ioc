"""
TẦNG 1: FOUNDATION - Cấu hình cơ bản

Quản lý:
- Cấu hình ứng dụng (tải từ .env)
- Kết nối cơ sở dữ liệu
- Thiết lập logging
- Exception tùy chỉnh
"""

__all__ = ["settings", "get_engine", "get_session", "get_logger", "exceptions"]
