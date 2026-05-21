"""
backfill_road_names.py
======================
Backfill dim_road.name cho các dim_way đang trỏ tới road có name='nan'.

Strategy:
  1. Lấy danh sách unique ways cần geocode (name IS NULL / 'nan' / '')
  2. Gọi TomTom Reverse Geocoding 1 call/way (dùng 1 representative segment)
  3. Upsert dim_road nếu tên mới chưa tồn tại
  4. UPDATE dim_way.road_key trỏ sang road đúng

API budget hôm nay: 325,000 - ~9,381 (ETL đã dùng) = ~315,619 còn lại
Ways cần geocode: 81,665 → TRONG BUDGET, chạy ngay.

Chạy: docker exec traffic-ioc-etl-runner python /app/scripts/backfill_road_names.py
"""

import sys
import time
import hashlib
import logging
from typing import Optional

sys.path.insert(0, "/app")

import requests
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.database import get_engine
from src.core.config import settings

# ── Config ───────────────────────────────────────────────────────────────────
TOTAL_LIMIT       = 115_000   # tối đa ways xử lý trong 1 lần chạy
BATCH_SIZE        = 500       # log mỗi 500 ways
SLEEP_BETWEEN     = 0.08      # giây giữa các API call (≈12 req/s)
SLEEP_PER_BATCH   = 1.5       # nghỉ thêm sau mỗi BATCH_SIZE calls
API_TIMEOUT       = 10        # seconds
UNNAMED_ROAD_NAME = "Đường không tên (TomTom)"
TOMTOM_BASE_URL   = "https://api.tomtom.com/search/2/reverseGeocode/{lat},{lon}.json"

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)-8s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("backfill_road_names")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _road_key_from_name(name: str) -> int:
    """Deterministic bigint hash từ tên đường. Tránh collision với existing keys."""
    h = int(hashlib.sha256(("road::" + name).encode()).hexdigest(), 16)
    return (h % (2**62)) + 1   # positive, fit signed bigint, avoid 0


def _reverse_geocode(lat: float, lon: float, api_key: str) -> Optional[str]:
    """
    Gọi TomTom Reverse Geocoding API.
    Trả về streetName (vi-VN) hoặc None nếu không tìm được.
    """
    url = TOMTOM_BASE_URL.format(lat=lat, lon=lon)
    try:
        resp = requests.get(
            url,
            params={"key": api_key, "radius": 100, "language": "vi-VN"},
            timeout=API_TIMEOUT,
        )
        if not resp.ok:
            return None
        addresses = resp.json().get("addresses", [])
        if addresses:
            addr = addresses[0].get("address", {})
            # Ưu tiên streetName, fallback sang municipalitySubdivision
            return addr.get("streetName") or addr.get("municipalitySubdivision")
    except Exception as exc:
        log.debug("Geocode error at (%s,%s): %s", lat, lon, exc)
    return None


def _get_api_key() -> str:
    """Lấy API key đầu tiên từ pool (sequential, không cần pool lock)."""
    keys = settings.get_tomtom_keys()
    if not keys:
        raise RuntimeError("No TomTom API keys configured")
    return keys[0]   # backfill dùng key đầu tiên, không cần rotation phức tạp


# ── Core logic ────────────────────────────────────────────────────────────────

def fetch_ways_needing_geocode(conn, limit: int) -> list:
    """
    Tối ưu: Lọc ways trước, sau đó mới join lấy tọa độ segment đại diện.
    Giảm tải cho PostGIS và tránh làm treo Docker.
    """
    log.info("Fetching ways needing geocode (limit=%d)...", limit)
    rows = conn.execute(text("""
        WITH target_ways AS (
            SELECT dw.way_key, dw.osm_highway_type
            FROM dim_way dw
            JOIN dim_road dr ON dw.road_key = dr.road_key
            WHERE dr.name IS NULL OR dr.name = '' OR dr.name = 'nan'
            LIMIT :limit
        )
        SELECT DISTINCT ON (tw.way_key)
            tw.way_key,
            NULL as road_key,
            COALESCE(tw.osm_highway_type, 'unknown') AS osm_highway_type,
            ST_Y(ST_Transform(ds.geometry_center::geometry, 4326)) AS lat,
            ST_X(ST_Transform(ds.geometry_center::geometry, 4326)) AS lon
        FROM target_ways tw
        JOIN dim_segment ds ON tw.way_key = ds.way_key
        ORDER BY tw.way_key
    """), {"limit": limit}).fetchall()
    log.info("Found %d ways to geocode.", len(rows))
    return rows


def upsert_road_and_update_way(session, way_key: int, street_name: str) -> None:
    """
    1. Tìm road_key hiện có cho street_name trong dim_road.
    2. Nếu chưa có → INSERT dim_road mới.
    3. UPDATE dim_way.road_key.
    """
    # Step 1: lookup existing road by name
    existing = session.execute(
        text("SELECT road_key FROM dim_road WHERE name = :n LIMIT 1"),
        {"n": street_name},
    ).fetchone()

    if existing:
        road_key = existing[0]
    else:
        # Step 2: insert new road
        road_key = _road_key_from_name(street_name)
        session.execute(
            text(
                "INSERT INTO dim_road (road_key, name) "
                "VALUES (:k, :n) "
                "ON CONFLICT (road_key) DO UPDATE SET name = EXCLUDED.name"
            ),
            {"k": road_key, "n": street_name},
        )

    # Step 3: update dim_way
    session.execute(
        text("UPDATE dim_way SET road_key = :rk WHERE way_key = :wk"),
        {"rk": road_key, "wk": way_key},
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def run_backfill(total_limit: int = TOTAL_LIMIT):
    engine  = get_engine()
    api_key = _get_api_key()

    with engine.connect() as conn:
        ways = fetch_ways_needing_geocode(conn, limit=total_limit)

    if not ways:
        log.info("Nothing to do — all ways already have road names.")
        return

    total      = len(ways)
    updated    = 0
    skipped    = 0
    api_errors = 0

    log.info("=" * 60)
    log.info("Starting backfill: %d ways, key=...%s", total, api_key[-8:])
    log.info("=" * 60)

    for i, row in enumerate(ways, start=1):
        way_key, old_road_key, hw_type, lat, lon = row

        # ── Rate limiting ────────────────────────────────────────
        time.sleep(SLEEP_BETWEEN)
        if i % BATCH_SIZE == 0:
            log.info(
                "[%d/%d] updated=%d skipped=%d api_errors=%d — pausing %.1fs",
                i, total, updated, skipped, api_errors, SLEEP_PER_BATCH,
            )
            time.sleep(SLEEP_PER_BATCH)

        # ── API call ─────────────────────────────────────────────
        street_name = _reverse_geocode(lat, lon, api_key)

        # Nếu không có tên, gán tên mặc định để không bị fetch lại lần sau
        final_name = street_name.strip() if (street_name and street_name.strip()) else UNNAMED_ROAD_NAME
        
        if final_name == UNNAMED_ROAD_NAME:
            skipped += 1
            log.debug("[%d/%d] way=%d (%s) → using placeholder '%s'", i, total, way_key, hw_type, UNNAMED_ROAD_NAME)
        
        # ── DB update ─────────────────────────────────────────────
        try:
            with Session(engine) as session:
                upsert_road_and_update_way(session, way_key, final_name)
                session.commit()
            if final_name != UNNAMED_ROAD_NAME:
                updated += 1
            log.debug("[%d/%d] way=%d (%s) → '%s'", i, total, way_key, hw_type, final_name)
        except Exception as exc:
            log.warning("DB update failed for way=%d: %s", way_key, exc)
            api_errors += 1

    # ── Summary ───────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("BACKFILL COMPLETE")
    log.info("  Total ways processed : %d", total)
    log.info("  Updated              : %d", updated)
    log.info("  Skipped (no name)    : %d", skipped)
    log.info("  DB errors            : %d", api_errors)
    log.info("  API calls used       : %d", total - skipped)
    log.info("=" * 60)


if __name__ == "__main__":
    run_backfill(total_limit=TOTAL_LIMIT)
