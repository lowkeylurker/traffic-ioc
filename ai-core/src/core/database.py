"""
database.py - Quản lý Kết nối Cơ sở dữ liệu

Quản lý kết nối SQLAlchemy tới PostgreSQL Data Warehouse.

Cung cấp:
- Engine singleton (khởi tạo lười biếng)
- Nhà máy SessionLocal
- Hàm health_check()
- Trình quản lý ngữ cảnh cho phiên làm việc

Chỉ được import kết nối database, KHÔNG truy vấn từ file này.
"""

import os
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from dotenv import load_dotenv

# Load biến môi trường từ file .env
load_dotenv()

@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Tạo SQLAlchemy engine singleton kết nối đến PostgreSQL."""
    db_user = os.getenv("DB_USER")
    db_pass = os.getenv("DB_PASSWORD")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_name = os.getenv("DB_NAME")
    
    # Chuỗi kết nối SQLAlchemy cho PostgreSQL
    db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=5,
        max_overflow=10,
        connect_args={
            "connect_timeout": 15,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
            "application_name": "ai-core-train",
        },
    )
    return engine
