"""Traffic Simulator – Giả lập dữ liệu vận tốc xe cộ theo thời gian thực.

Vòng lặp vô hạn, mỗi 30 giây:
  1. Query toàn bộ segment_key từ dim_segment.
  2. Random vận tốc theo trọng số cho từng segment.
  3. INSERT batch vào fact_traffic_flow (ON CONFLICT DO UPDATE).

Phân loại vận tốc:
  - 3 segment đầu : kẹt xe cứng (2.0 – 19.9 km/h)
  - Các segment còn lại:
      60% thông thoáng  → 41 – 60 km/h
      30% ùn ứ          → 20 – 40 km/h
      10% kẹt xe        →  5 – 19.9 km/h

Chạy độc lập:
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

# ── Đảm bảo import gốc từ thư mục data-pipeline ─────────────────────────────
_PIPELINE_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_ROOT))

from dotenv import load_dotenv

load_dotenv(dotenv_path=_PIPELINE_ROOT / ".env", override=False)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# ── Cấu hình ─────────────────────────────────────────────────────────────────
TZ_HCM = ZoneInfo("Asia/Ho_Chi_Minh")
SLEEP_SECONDS = 30
BATCH_SIZE = 500
FREE_FLOW_SPEED = 60.0      # km/h – dùng để tính traffic_index

# Số segment đầu luôn bị cứng vào kẹt xe
JAMMED_SEGMENT_COUNT = 3

# Trọng số phân phối vận tốc cho các segment bình thường
_SPEED_WEIGHTS = [60, 30, 10]   # [thông thoáng, ùn ứ, kẹt xe]
_SPEED_BANDS = [
    (41.0, 60.0),   # thông thoáng
    (20.0, 40.0),   # ùn ứ
    (5.0,  19.9),   # kẹt xe
]

# ── Connection string từ biến môi trường ─────────────────────────────────────
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

# ── SQL ───────────────────────────────────────────────────────────────────────
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
    ) VALUES (
        :traffic_flow_key,
        :segment_key,
        :date_key,
        :time_key,
        :timestamp,
        :current_speed_kmh,
        :traffic_index,
        :inserted_at
    )
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
    """Random vận tốc theo quy tắc phân loại.

    Args:
        idx: Vị trí của segment trong danh sách (0-indexed).

    Returns:
        float: Vận tốc km/h (làm tròn 1 chữ số).
    """
    if idx < JAMMED_SEGMENT_COUNT:
        # Kẹt xe cứng: 2.0 – 19.9 km/h
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
    """Trả về (date_key YYYYMMDD, time_key phút-trong-ngày) từ thời điểm HCM."""
    date_key = int(now.strftime("%Y%m%d"))
    time_key = now.hour * 60 + now.minute
    return date_key, time_key


# ═════════════════════════════════════════════════════════════════════════════
# CORE FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════


def fetch_segment_keys(session: Session) -> list[int]:
    """Query danh sách segment_key từ dim_segment."""
    result = session.execute(_SQL_GET_SEGMENTS)
    return [row[0] for row in result]


def simulate_batch(segment_keys: list[int], now: datetime) -> list[dict]:
    """Tạo danh sách records giả lập vận tốc cho toàn bộ segment.

    Args:
        segment_keys : Danh sách segment_key lấy từ DB.
        now          : Thời điểm snapshot (Asia/Ho_Chi_Minh aware).

    Returns:
        list[dict]: Records sẵn sàng INSERT vào fact_traffic_flow.
    """
    date_key, time_key = _derive_keys(now)
    # Strip timezone để lưu vào cột TIMESTAMP (naive)
    ts_naive = now.replace(tzinfo=None)
    inserted_at = datetime.utcnow()

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
                "timestamp": ts_naive,
                "current_speed_kmh": speed,
                "traffic_index": t_index,
                "inserted_at": inserted_at,
            }
        )
    return records


def insert_records(session: Session, records: list[dict]) -> int:
    """INSERT batch vào fact_traffic_flow trong một transaction.

    Dùng Transaction một cục (toàn bộ batch commit cùng lúc).

    Returns:
        int: Số records đã xử lý.
    """
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        session.execute(_SQL_UPSERT, batch)
        total += len(batch)
    return total


# ═════════════════════════════════════════════════════════════════════════════
# MAIN LOOP
# ═════════════════════════════════════════════════════════════════════════════


def run_once(engine) -> bool:
    """Chạy một lần: query → simulate → insert.

    Returns:
        bool: True nếu thành công, False nếu không có segment.
    """
    with Session(engine) as session:
        # 1. Lấy segment keys
        segment_keys = fetch_segment_keys(session)

        if not segment_keys:
            print("[WARN] dim_segment chưa có dữ liệu. Bỏ qua lần này.")
            return False

        print(f"[INFO] Tìm thấy {len(segment_keys)} segments.")

        # 2. Giả lập vận tốc
        now_hcm = datetime.now(tz=TZ_HCM)
        records = simulate_batch(segment_keys, now_hcm)

        # 3. Insert batch trong một transaction
        try:
            count = insert_records(session, records)
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
    """Vòng lặp vô hạn: cứ mỗi `sleep_seconds` giây chạy một lần.

    Args:
        sleep_seconds: Khoảng cách giữa các lần giả lập (mặc định 30s).
    """
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
            # Không raise – tiếp tục vòng lặp sau khi sleep

        print(f"[INFO] Ngủ {sleep_seconds}s đến lần tiếp theo ...")
        try:
            time.sleep(sleep_seconds)
        except KeyboardInterrupt:
            print("\n[INFO] Simulator dừng bởi người dùng (Ctrl+C).")
            break


if __name__ == "__main__":
    run()
