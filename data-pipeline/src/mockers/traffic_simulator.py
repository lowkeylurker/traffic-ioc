"""Traffic Simulator – Simulate real-time vehicle speed data.

Run independently:
  python -m src.mockers.traffic_simulator
"""

from __future__ import annotations

import hashlib
import os
import random
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

_PIPELINE_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_ROOT))

from dotenv import load_dotenv

load_dotenv(dotenv_path=_PIPELINE_ROOT / ".env", override=False)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# Config
TZ_HCM = ZoneInfo("Asia/Ho_Chi_Minh")
SLEEP_SECONDS = 15
BATCH_SIZE = 500
FREE_FLOW_SPEED = 60.0      

JAMMED_SEGMENT_COUNT = 3

_SPEED_WEIGHTS = [60, 30, 10]   
_SPEED_BANDS = [
    (41.0, 60.0),   
    (20.0, 40.0),   
    (5.0,  19.9),   
]

# Connection string
_DB_HOST = os.environ.get("DB_HOST", "")
_DB_PORT = os.environ.get("DB_PORT", "5432")
_DB_NAME = os.environ.get("DB_NAME", "")
_DB_USER = os.environ.get("DB_USER", "")
_DB_PASS = os.environ.get("DB_PASSWORD", "")
_DB_SSL  = os.environ.get("DB_SSLMODE", "disable")

DATABASE_URL = (
    f"postgresql://{_DB_USER}:{_DB_PASS}@{_DB_HOST}:{_DB_PORT}/{_DB_NAME}"
    f"?sslmode={_DB_SSL}"
)

# SQL
_SQL_GET_SEGMENTS = text(
    "SELECT segment_key FROM dim_segment ORDER BY segment_key"
)

_SQL_UPSERT = text(
    """
    INSERT INTO fact_traffic_flow (
        traffic_flow_key,
        segment_key,
        date_key,
        time_key,
        timestamp,
        current_speed_kmh,
        traffic_index,
        inserted_at
    ) VALUES %s
    ON CONFLICT (traffic_flow_key, date_key) DO UPDATE SET
        current_speed_kmh = EXCLUDED.current_speed_kmh,
        traffic_index     = EXCLUDED.traffic_index,
        inserted_at       = EXCLUDED.inserted_at
    """
)


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═════════════════════════════════════════════════════════════════════════════


def _generate_traffic_flow_key(segment_key: int, date_key: int, time_key: int) -> int:
    """Sinh surrogate key deterministic: sha256(segment:date:time)[:15]."""
    raw = f"{segment_key}:{date_key}:{time_key}"
    hex_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15]
    return int(hex_hash, 16)


def _random_speed(idx: int) -> float:
    """Random speed according to classification rules."""
    if idx < JAMMED_SEGMENT_COUNT:
        speed = random.uniform(2.0, 19.9)
    else:
        band_lo, band_hi = random.choices(_SPEED_BANDS, weights=_SPEED_WEIGHTS, k=1)[0]
        speed = random.uniform(band_lo, band_hi)
    return round(speed, 1)


def _calc_traffic_index(speed: float, free_flow: float = FREE_FLOW_SPEED) -> float:
    """traffic_index = speed / free_flow_speed, clamp [0.0, 1.0]."""
    if free_flow <= 0:
        return 0.0
    return round(min(max(speed / free_flow, 0.0), 1.0), 2)


def _derive_keys(now: datetime) -> tuple[int, int]:
    """Return (date_key YYYYMMDD, time_key minutes-in-day) from HCM time."""
    date_key = int(now.strftime("%Y%m%d"))
    time_key = now.hour * 60 + now.minute
    return date_key, time_key


# ═════════════════════════════════════════════════════════════════════════════
# CORE FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════


def fetch_segment_keys(session: Session) -> list[int]:
    """Query list of segment_key from dim_segment."""
    result = session.execute(_SQL_GET_SEGMENTS)
    return [row[0] for row in result]


def simulate_batch(segment_keys: list[int], now: datetime) -> list[dict]:
    """Generate list of simulated speed records for all segments."""
    date_key, time_key = _derive_keys(now)
    ts_utc_naive = datetime.utcnow()
    inserted_at = ts_utc_naive

    records = []
    for idx, seg_key in enumerate(segment_keys):
        speed = _random_speed(idx)
        t_index = _calc_traffic_index(speed)
        flow_key = _generate_traffic_flow_key(seg_key, date_key, time_key)

        records.append(
            {
                "traffic_flow_key": flow_key,
                "segment_key": seg_key,
                "date_key": date_key,
                "time_key": time_key,
                "timestamp": ts_utc_naive,
                "current_speed_kmh": speed,
                "traffic_index": t_index,
                "inserted_at": inserted_at,
            }
        )
    return records


def insert_records(session: Session, records: list[dict]) -> int:
    """INSERT batch vào fact_traffic_flow trong một transaction."""
    from psycopg2.extras import execute_values
    
    # Prepare data as tuple for execute_values
    values = [
        (
            r["traffic_flow_key"],
            r["segment_key"],
            r["date_key"],
            r["time_key"],
            r["timestamp"],
            r["current_speed_kmh"],
            r["traffic_index"],
            r["inserted_at"]
        ) for r in records
    ]
    
    conn = session.connection().connection
    with conn.cursor() as cur:
        execute_values(cur, _SQL_UPSERT.text, values, page_size=2000)
    
    return len(records)


# ═════════════════════════════════════════════════════════════════════════════
# MAIN LOOP
# ═════════════════════════════════════════════════════════════════════════════


def run_once(engine) -> bool:
    """Run once: query → simulate → insert."""
    with Session(engine) as session:

        segment_keys = fetch_segment_keys(session)

        if not segment_keys:
            print("[WARN] dim_segment chưa có dữ liệu. Bỏ qua lần này.")
            return False

        print(f"[INFO] Tìm thấy {len(segment_keys)} segments.")

        now_hcm = datetime.now(tz=TZ_HCM)
        print(f"[DEBUG] Gọi simulate_batch lúc {now_hcm}")
        records = simulate_batch(segment_keys, now_hcm)
        print(f"[DEBUG] simulate_batch xong, tạo {len(records)} records")

        try:
            print("[DEBUG] Đang chèn records vào DB...")
            count = insert_records(session, records)
            print("[DEBUG] Đã chèn xong DB!")
            session.commit()
        except Exception as exc:
            session.rollback()
            print(f"[ERROR] Insert thất bại: {exc}", file=sys.stderr)
            raise

    time_str = now_hcm.strftime("%H:%M:%S")
    jammed = [r for r in records[:JAMMED_SEGMENT_COUNT]]
    normal_jam = [r for r in records[JAMMED_SEGMENT_COUNT:] if r["current_speed_kmh"] < 20]
    print(
        f"[INFO] Đã cập nhật vận tốc lúc {time_str} – "
        f"{count} segments | "
        f"Kẹt ({JAMMED_SEGMENT_COUNT} cố định + {len(normal_jam)} random) | "
        f"Tốc độ trung bình: {sum(r['current_speed_kmh'] for r in records)/len(records):.1f} km/h"
    )
    return True


def run(sleep_seconds: int = SLEEP_SECONDS) -> None:
    """Infinite loop: run every `sleep_seconds` seconds."""
    print("=" * 65)
    print("  Traffic Simulator – fact_traffic_flow")
    print(f"  Interval  : {sleep_seconds}s")
    print(f"  Batch size: {BATCH_SIZE}")
    print(f"  Jammed seg: {JAMMED_SEGMENT_COUNT} segment đầu cố định kẹt xe")
    print(f"  DB        : {_DB_HOST}:{_DB_PORT}/{_DB_NAME}")
    print("=" * 65)

    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=3)

    cycle = 0
    while True:
        cycle += 1
        print(f"\n[CYCLE {cycle}] ─── {datetime.now(tz=TZ_HCM).strftime('%Y-%m-%d %H:%M:%S')} ───")
        try:
            run_once(engine)
        except KeyboardInterrupt:
            print("\n[INFO] Simulator dừng bởi người dùng (Ctrl+C).")
            break
        except Exception as exc:
            print(f"[ERROR] Lỗi không mong đợi tại cycle {cycle}: {exc}", file=sys.stderr)

        print(f"[INFO] Ngủ {sleep_seconds}s đến lần tiếp theo ...")
        try:
            time.sleep(sleep_seconds)
        except KeyboardInterrupt:
            print("\n[INFO] Simulator dừng bởi người dùng (Ctrl+C).")
            break


if __name__ == "__main__":
    run()
