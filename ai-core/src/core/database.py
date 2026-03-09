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
from sqlalchemy import create_engine
import pandas as pd
from dotenv import load_dotenv

# Load biến môi trường từ file .env
load_dotenv()

def get_engine():
    """Tạo SQLAlchemy engine kết nối đến PostgreSQL."""
    db_user = os.getenv("DB_USER", "postgres")
    db_pass = os.getenv("DB_PASSWORD", "postgres")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "traffic_ioc")
    
    # Chuỗi kết nối SQLAlchemy cho PostgreSQL
    db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    engine = create_engine(db_url)
    return engine
