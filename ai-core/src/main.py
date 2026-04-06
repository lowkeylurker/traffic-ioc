import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
import psycopg2
from fastapi import FastAPI
from dotenv import load_dotenv

# Import CityFlow - Engine giả lập giao thông
try:
    import cityflow
    CITYFLOW_AVAILABLE = True
except ImportError:
    CITYFLOW_AVAILABLE = False

# Load biến môi trường từ tệp .env
load_dotenv()

app = FastAPI(title="Smart Traffic AI-Core Health Checker")


def _psycopg2_compatible_dsn(raw_db_url: str) -> str:
    """Remove SQLAlchemy-specific query params that psycopg2 rejects."""
    parts = urlsplit(raw_db_url)
    if not parts.query:
        return raw_db_url

    query_items = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() != "schema"]
    new_query = urlencode(query_items)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))

@app.get("/health-check")
def health_check():
    status = {
        "cityflow": "❌ Not Found",
        "database": "❌ Disconnected",
        "env_variables": "❌ Missing"
    }

    # 1. Kiểm tra CityFlow
    if CITYFLOW_AVAILABLE:
        status["cityflow"] = "🚀 Engine Ready!"

    # 2. Kiểm tra Biến môi trường
    db_url = os.getenv("DATABASE_URL") or os.getenv("DB_URL")
    if db_url:
        status["env_variables"] = "✅ Loaded"
        
        # 3. Kiểm tra kết nối Database (Postgres)
        try:
            # Thử tạo kết nối ngắn hạn tới database
            conn = psycopg2.connect(_psycopg2_compatible_dsn(db_url))
            conn.close()
            status["database"] = "✅ Connected to Postgres"
        except Exception as e:
            status["database"] = f"❌ Connection Error: {str(e)}"
    
    return {
        "message": "AI-Core Status Report",
        "results": status
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)