import time
import random
import os
import sys
import hashlib
from datetime import datetime
from pathlib import Path

# Đảm bảo đọc đúng file .env
_PIPELINE_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_ROOT))

from dotenv import load_dotenv
load_dotenv(dotenv_path=_PIPELINE_ROOT / ".env", override=False)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# Kết nối Azure DB
DB_URL = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}?sslmode={os.getenv('DB_SSLMODE', 'require')}"
engine = create_engine(DB_URL)

# ĐÃ SỬA: Chuyển 'severity' thành dạng số (1: LOW, 2: MEDIUM, 3: HIGH, 4: CRITICAL)
SEED_LOCATIONS = [
    {"name": "Ngã tư Hàng Xanh", "lat": 10.8005, "lon": 106.7112, "type": "ACCIDENT", "severity": 3},
    {"name": "Nguyễn Hữu Cảnh", "lat": 10.7925, "lon": 106.7160, "type": "FLOOD", "severity": 2},
    {"name": "Lê Lợi", "lat": 10.7745, "lon": 106.7015, "type": "CONSTRUCTION", "severity": 1}
]

OTHER_TYPES = ["ACCIDENT", "FIRE", "FLOOD"]
OTHER_SEVERITIES = [1, 2, 4] # LOW, MEDIUM, CRITICAL

def _generate_incident_key(lat, lon, ts):
    raw = f"{lat}:{lon}:{ts}"
    return int(hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15], 16)

def run():
    print("🚨 Khởi động bộ giả lập Sự cố (Vào bảng fact_incident chuẩn)...")
    
    with Session(engine) as session:
        seg_res = session.execute(text("SELECT segment_key FROM dim_segment LIMIT 1")).fetchone()
        default_segment = seg_res[0] if seg_res else 0

        session.execute(text("UPDATE fact_incident SET is_active = FALSE WHERE is_active = TRUE"))
        session.commit()

        insert_sql = text("""
            INSERT INTO fact_incident (
                incident_key, date_key, time_key, segment_key, 
                geometry, incident_type, severity_level, 
                timestamp, is_simulated, is_active
            ) VALUES (
                :incident_key, :date_key, :time_key, :segment_key,
                ST_GeomFromText(:wkt, 4326), :incident_type, :severity_level,
                :timestamp, TRUE, TRUE
            )
        """)

        now = datetime.now()
        date_key = int(now.strftime("%Y%m%d"))
        time_key = now.hour * 60 + now.minute

        for loc in SEED_LOCATIONS:
            i_key = _generate_incident_key(loc['lat'], loc['lon'], now.timestamp())
            session.execute(insert_sql, {
                "incident_key": i_key, "date_key": date_key, "time_key": time_key, "segment_key": default_segment,
                "wkt": f"POINT({loc['lon']} {loc['lat']})", "incident_type": loc["type"], "severity_level": loc["severity"],
                "timestamp": now
            })
        session.commit()
        print("✅ Đã tạo 3 sự cố cố định (Hàng Xanh, Nguyễn Hữu Cảnh, Lê Lợi).")

    print("🔄 Bắt đầu vòng lặp Real-time (Mỗi 15 giây)...")
    while True:
        try:
            with Session(engine) as session:
                now = datetime.now()
                date_key = int(now.strftime("%Y%m%d"))
                time_key = now.hour * 60 + now.minute

                if random.random() < 0.3:
                    resolve_sql = text("""
                        UPDATE fact_incident SET is_active = FALSE 
                        WHERE incident_key IN (
                            SELECT incident_key FROM fact_incident WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1
                        ) RETURNING incident_type
                    """)
                    res = session.execute(resolve_sql).fetchone()
                    if res:
                        print(f"  [RESOLVED] Đội cứu hộ đã xử lý xong {res[0]}")
                
                if random.random() < 0.3:
                    lat = random.uniform(10.7500, 10.8200)
                    lon = random.uniform(106.6500, 106.7500)
                    itype = random.choice(OTHER_TYPES)
                    isev = random.choice(OTHER_SEVERITIES)
                    i_key = _generate_incident_key(lat, lon, now.timestamp())
                    
                    session.execute(insert_sql, {
                        "incident_key": i_key, "date_key": date_key, "time_key": time_key, "segment_key": default_segment,
                        "wkt": f"POINT({lon} {lat})", "incident_type": itype, "severity_level": isev,
                        "timestamp": now
                    })
                    print(f"  [NEW] 🔴 Phát sinh {itype} mức độ {isev} tại ({lat:.4f}, {lon:.4f})")
                
                session.commit()
        except Exception as e:
            print(f"[ERROR] {e}")
        time.sleep(15)

if __name__ == "__main__":
    run()