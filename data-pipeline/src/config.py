"""
Cấu hình kết nối Database cho Data Pipeline
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()


class DatabaseConfig:
    """Quản lý kết nối và cấu hình Database"""
    
    def __init__(self):
        self.host = os.getenv('DB_HOST', 'localhost')
        self.port = os.getenv('DB_PORT', '5432')
        self.database = os.getenv('DB_NAME', 'traffic_ioc_db')
        self.user = os.getenv('DB_USER', 'postgres')
        self.password = os.getenv('DB_PASSWORD', '')
        self.sslmode = os.getenv('DB_SSLMODE', 'disable')
        
        # Validate configuration
        if not self.password:
            raise ValueError("DB_PASSWORD must be set in .env file")
    
    def get_connection_string(self):
        """Trả về connection string cho SQLAlchemy"""
        return (
            f"postgresql://{self.user}:{self.password}@"
            f"{self.host}:{self.port}/{self.database}"
        )
    
    def get_engine(self):
        """Tạo SQLAlchemy engine"""
        return create_engine(self.get_connection_string(), echo=False)
    
    def get_psycopg2_connection(self):
        """Tạo psycopg2 connection (raw connection)"""
        return psycopg2.connect(
            host=self.host,
            port=self.port,
            database=self.database,
            user=self.user,
            password=self.password,
            sslmode=self.sslmode
        )
    
    def test_connection(self):
        """Kiểm tra kết nối Database"""
        try:
            conn = self.get_psycopg2_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            conn.close()
            return True
        except Exception as e:
            print(f"Database connection failed: {e}")
            return False


# Global config instance
db_config = DatabaseConfig()
