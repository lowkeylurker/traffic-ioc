import os
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
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        status["env_variables"] = "✅ Loaded"
        
        # 3. Kiểm tra kết nối Database (Postgres)
        try:
            # Thử tạo kết nối ngắn hạn tới database
            conn = psycopg2.connect(db_url)
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