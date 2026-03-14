"""OSM Loader – Nạp mạng lưới đường bộ vào dim_segment.

Chạy độc lập:
  python -m src.loaders.osm_loader
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

# ── Đảm bảo import gốc từ thư mục data-pipeline ─────────────────────────────
_PIPELINE_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_ROOT))

# ── Load .env trước khi dùng settings ────────────────────────────────────────
from dotenv import load_dotenv  # python-dotenv

_ENV_FILE = _PIPELINE_ROOT / ".env"
load_dotenv(dotenv_path=_ENV_FILE, override=False)

import osmnx as ox
from shapely.geometry import LineString, MultiLineString
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# ── Cấu hình kết nối DB từ biến môi trường ───────────────────────────────────
_DB_HOST = os.environ.get("DB_HOST", "")
_DB_PORT = os.environ.get("DB_PORT", "")
_DB_NAME = os.environ.get("DB_NAME", "")
_DB_USER = os.environ.get("DB_USER", "")
_DB_PASS = os.environ.get("DB_PASSWORD", "")          
_DB_SSL  = os.environ.get("DB_SSLMODE", "")

DATABASE_URL = (
    f"postgresql://{_DB_USER}:{_DB_PASS}@{_DB_HOST}:{_DB_PORT}/{_DB_NAME}"
    f"?sslmode={_DB_SSL}"
)

DISTRICTS = [
    "Quận 1, Hồ Chí Minh, Vietnam",
    "Quận 3, Hồ Chí Minh, Vietnam",
]
NETWORK_TYPE = "drive"
BATCH_SIZE = 500

# ── SQL INSERT ─────────────────────────────────────────
_INSERT_SQL = text(
    """
    INSERT INTO dim_segment (
        segment_key,
        segment_id_source,
        length_m,
        geometry_linestring,
        is_one_way
    ) VALUES (
        :segment_key,
        :segment_id_source,
        :length_m,
        ST_GeomFromText(:linestring_wkt, 4326),
        :is_one_way
    )
    ON CONFLICT (segment_key) DO NOTHING
    """
)

# ═════════════════════════════════════════════════════════════════════════════
# 1. EXTRACT: osmnx kéo dữ liệu drive network cho Quận 1 & Quận 3, HCM.
# ═════════════════════════════════════════════════════════════════════════════


def extract_osm_edges(districts: list[str]) -> list[dict[str, Any]]:
    """Kéo dữ liệu mạng lưới đường bộ từ OSM cho danh sách quận/huyện.

    Args:
        districts: Danh sách tên quận theo dạng "Quận X, Hồ Chí Minh, Vietnam".

    Returns:
        list[dict]: Mỗi phần tử là 1 edge thô từ osmnx GeoDataFrame (as dict).
    """
    ox.settings.use_cache = True
    ox.settings.log_console = False  # tắt log osmnx, dùng print riêng

    all_edges: list[dict[str, Any]] = []

    for district in districts:
        print(f"\n[EXTRACT] Đang tải dữ liệu OSM cho: {district!r} ...")
        try:
            graph = ox.graph_from_place(district, network_type=NETWORK_TYPE)
            _, edges_gdf = ox.graph_to_gdfs(graph)
            edges_gdf = edges_gdf.reset_index()  # u, v, key → cột bình thường
            records = edges_gdf.to_dict(orient="records")
            print(
                f"[EXTRACT]   ✓ {len(records)} edges tải về từ {district!r}"
            )
            all_edges.extend(records)
        except Exception as exc:
            print(f"[EXTRACT]   ✗ Lỗi khi tải {district!r}: {exc}", file=sys.stderr)
            raise

    print(f"\n[EXTRACT] Tổng cộng: {len(all_edges)} edges từ {len(districts)} quận")
    return all_edges


# ═════════════════════════════════════════════════════════════════════════════
# 2. TRANSFORM: Lọc edge
# ═════════════════════════════════════════════════════════════════════════════


def _resolve_name(value: Any) -> str | None:
    """Trả về tên chuỗi từ giá trị có thể là str hoặc list."""
    if isinstance(value, list):
        value = value[0] if value else None
    if value is None or str(value).strip() == "":
        return None
    return str(value).strip()


def _resolve_osmid(value: Any) -> int | None:
    """Trả về osmid dưới dạng int (lấy phần tử đầu nếu là list)."""
    if isinstance(value, list):
        value = value[0] if value else None
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _geometry_to_wkt(geom: Any) -> str | None:
    """Chuyển Shapely geometry → WKT SRID 4326.

    Hỗ trợ LineString và MultiLineString (lấy line dài nhất).
    """
    if geom is None:
        return None

    if isinstance(geom, MultiLineString):
        # Lấy đoạn dài nhất trong MultiLineString
        geom = max(geom.geoms, key=lambda g: g.length)

    if isinstance(geom, LineString) and not geom.is_empty:
        return geom.wkt  # ví dụ: "LINESTRING (106.7 10.8, ...)"

    return None


def transform_edges(raw_edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Lọc và chuẩn hoá các edge OSM → records sẵn sàng nạp vào dim_segment.

    Quy tắc lọc:
      - Bỏ qua edge không có tên (name is None/rỗng).
      - Bỏ qua edge không có osmid hợp lệ.
      - Bỏ qua edge geometry không hợp lệ.

    segment_key được sinh tự động tăng dần từ 1.

    Returns:
        list[dict]: records đã chuẩn hoá, deduplicated theo osmid.
    """
    print("\n[TRANSFORM] Bắt đầu chuẩn hoá dữ liệu edges ...")

    seen_osmids: set[int] = set()
    records: list[dict[str, Any]] = []

    total = len(raw_edges)
    skipped_no_name = 0
    skipped_no_osmid = 0
    skipped_no_geom = 0
    skipped_dup = 0

    for raw in raw_edges:
        # ── osmid ─────────────────────────────────────────────────────
        osmid = _resolve_osmid(raw.get("osmid"))
        if osmid is None:
            skipped_no_osmid += 1
            continue

        # ── name – lọc bỏ nếu không có ───────────────────────────────
        name = _resolve_name(raw.get("name"))
        if name is None:
            skipped_no_name += 1
            continue

        # ── geometry → WKT ────────────────────────────────────────────
        linestring_wkt = _geometry_to_wkt(raw.get("geometry"))
        if linestring_wkt is None:
            skipped_no_geom += 1
            continue

        # ── dedup theo osmid ──────────────────────────────────────────
        if osmid in seen_osmids:
            skipped_dup += 1
            continue
        seen_osmids.add(osmid)

        # ── length ────────────────────────────────────────────────────
        length_raw = raw.get("length", 0.0)
        try:
            length_m = round(float(length_raw), 2)
        except (ValueError, TypeError):
            length_m = 0.0

        # ── oneway ────────────────────────────────────────────────────
        oneway_raw = raw.get("oneway", False)
        if isinstance(oneway_raw, list):
            oneway_raw = oneway_raw[0] if oneway_raw else False
        is_one_way = bool(oneway_raw)

        records.append(
            {
                "segment_id_source": osmid,
                "name": name,
                "length_m": length_m,
                "linestring_wkt": linestring_wkt,
                "is_one_way": is_one_way,
            }
        )

    # Gắn segment_key tăng dần từ 1 (chỉ để nạp lần đầu;
    # DB có thể dùng SEQUENCE/SERIAL cho production)
    for idx, rec in enumerate(records, start=1):
        rec["segment_key"] = idx

    print(f"[TRANSFORM] Tổng edges đầu vào : {total}")
    print(f"[TRANSFORM]   Bỏ qua (không tên)  : {skipped_no_name}")
    print(f"[TRANSFORM]   Bỏ qua (không osmid) : {skipped_no_osmid}")
    print(f"[TRANSFORM]   Bỏ qua (không geom)  : {skipped_no_geom}")
    print(f"[TRANSFORM]   Bỏ qua (trùng osmid) : {skipped_dup}")
    print(f"[TRANSFORM]   ✓ Records hợp lệ     : {len(records)}")

    return records


# ═════════════════════════════════════════════════════════════════════════════
# 3. LOAD: INSERT INTO dim_segment … ON CONFLICT DO NOTHING (raw SQL + PostGIS).
# ═════════════════════════════════════════════════════════════════════════════


def _get_next_segment_key(session: Session) -> int:
    """Lấy giá trị segment_key lớn nhất hiện có trong DB, trả về max+1.

    Nếu bảng rỗng, trả về 1.
    """
    result = session.execute(
        text("SELECT COALESCE(MAX(segment_key), 0) FROM dim_segment")
    )
    return result.scalar() + 1


def load_to_db(records: list[dict[str, Any]], database_url: str) -> int:
    """Nạp records vào dim_segment bằng INSERT ON CONFLICT DO NOTHING.

    segment_key được điều chỉnh để tiếp nối từ giá trị lớn nhất trong DB.

    Args:
        records     : Output từ transform_edges().
        database_url: SQLAlchemy connection string.

    Returns:
        int: Số dòng đã insert thành công (ON CONFLICT DO NOTHING → bỏ qua dup).
    """
    if not records:
        print("\n[LOAD] Không có records để nạp.")
        return 0

    print(f"\n[LOAD] Kết nối cơ sở dữ liệu: {_DB_HOST}:{_DB_PORT}/{_DB_NAME}")
    engine = create_engine(database_url, pool_pre_ping=True)

    total_inserted = 0

    with Session(engine) as session:
        # Xác định segment_key bắt đầu để tránh trùng với dữ liệu cũ
        start_key = _get_next_segment_key(session)
        print(f"[LOAD] segment_key bắt đầu từ: {start_key}")

    # Re-map segment_key cho toàn bộ batch
    for idx, rec in enumerate(records):
        rec["segment_key"] = start_key + idx

    # ── Nạp theo batch ────────────────────────────────────────────────────────
    total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE
    print(
        f"[LOAD] Bắt đầu nạp {len(records)} records "
        f"theo {total_batches} batch (batch_size={BATCH_SIZE}) ..."
    )

    for batch_no in range(1, total_batches + 1):
        start = (batch_no - 1) * BATCH_SIZE
        end = start + BATCH_SIZE
        batch = records[start:end]

        with Session(engine) as session:
            try:
                for row in batch:
                    session.execute(_INSERT_SQL, row)
                session.commit()
                # rowcount không tin cậy cho ON CONFLICT DO NOTHING,
                # ta đếm batch size thực tế để báo tiến trình
                total_inserted += len(batch)
                print(
                    f"[LOAD] Batch {batch_no}/{total_batches}: "
                    f"đã xử lý {len(batch)} records ✓"
                )
            except Exception as exc:
                session.rollback()
                print(
                    f"[LOAD] ✗ Lỗi tại batch {batch_no}: {exc}",
                    file=sys.stderr,
                )
                raise

    print(f"\n[LOAD] ✓ Hoàn tất! Đã xử lý {total_inserted} records → dim_segment")
    return total_inserted


# ═════════════════════════════════════════════════════════════════════════════
# RUNNER – entry point
# ═════════════════════════════════════════════════════════════════════════════


def run(districts: list[str] | None = None, database_url: str | None = None) -> int:
    """Chạy toàn bộ pipeline Extract → Transform → Load.

    Args:
        districts   : Danh sách tên quận (mặc định: Quận 1 & Quận 3, HCM).
        database_url: SQLAlchemy URL (mặc định: lấy từ biến môi trường).

    Returns:
        int: Số records đã được xử lý trong bước Load.
    """
    if districts is None:
        districts = DISTRICTS
    if database_url is None:
        database_url = DATABASE_URL

    print("=" * 65)
    print("  OSM Loader – dim_segment")
    print(f"  Khu vực : {', '.join(districts)}")
    print(f"  Network : {NETWORK_TYPE}")
    print("=" * 65)

    # 1. Extract
    raw_edges = extract_osm_edges(districts)

    # 2. Transform
    records = transform_edges(raw_edges)

    # 3. Load
    inserted = load_to_db(records, database_url)

    print("\n[DONE] Pipeline hoàn thành.")
    return inserted


if __name__ == "__main__":
    run()
