"""
Script chạy lần lượt 4 file SQL để khởi tạo Data Warehouse.
Đọc thông tin kết nối từ file .env ở thư mục gốc project.

Cách dùng:
    cd infrastructure/postgres
    python run.py              # Chạy bình thường
    python run.py --verbose    # Hiện chi tiết SQL đang chạy
    python run.py --dry-run    # Chỉ kiểm tra, không chạy SQL

Yêu cầu: pip install psycopg2-binary python-dotenv
"""

import os
import sys
import time
import logging
import argparse
import traceback
from datetime import datetime

import psycopg2
from pathlib import Path
from dotenv import load_dotenv

# ---- Cấu hình Logger ----
LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

# Tạo logger gốc
logger = logging.getLogger("db_init")
logger.setLevel(logging.DEBUG)

# Handler 1: Ghi ra file (luôn DEBUG – ghi hết mọi thứ)
file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
logger.addHandler(file_handler)

# Handler 2: Hiện ra console (mặc định INFO, --verbose sẽ chuyển sang DEBUG)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter(
    "%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
))
logger.addHandler(console_handler)


# ---- Cấu hình ----
SQL_FILES = [
    "1_init_extensions.sql",
    "2_create_dims.sql",
    "3_create_facts.sql",
    "4_indexes.sql",
]

SCRIPT_DIR = Path(__file__).resolve().parent
INFRA_DIR = SCRIPT_DIR.parent  # infrastructure/


def load_env() -> None:
    """Load biến môi trường từ .env trong thư mục infrastructure/."""
    dotenv_path = INFRA_DIR / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path)
        logger.info(f"Đã load .env từ: {dotenv_path}")
    else:
        logger.warning(f"Không tìm thấy .env tại: {dotenv_path}")
        logger.warning("Sẽ dùng giá trị mặc định hoặc biến môi trường hệ thống.")


def get_db_config() -> dict:
    """Đọc thông tin kết nối DB từ biến môi trường."""
    config = {
        "host": os.getenv("DB_HOST", ""),
        "port": int(os.getenv("DB_PORT", "")),
        "dbname": os.getenv("DB_NAME", ""),
        "user": os.getenv("DB_USER", ""),
        "password": os.getenv("DB_PASSWORD", ""),
        "sslmode": os.getenv("DB_SSLMODE", ""),
    }
    logger.debug(f"DB config: host={config['host']}, port={config['port']}, "
                 f"dbname={config['dbname']}, user={config['user']}, "
                 f"sslmode={config['sslmode']}")
    return config


def connect_db(config: dict):
    """Kết nối database, trả về (connection, cursor)."""
    logger.info(f"Đang kết nối tới {config['user']}@{config['host']}:{config['port']}/{config['dbname']} ...")
    try:
        conn = psycopg2.connect(
            host=config["host"],
            port=config["port"],
            dbname=config["dbname"],
            user=config["user"],
            password=config["password"],
            sslmode=config["sslmode"],
        )
        conn.autocommit = True  # Cần cho CREATE EXTENSION, ALTER DATABASE
        cursor = conn.cursor()

        # Log thông tin server
        cursor.execute("SELECT version();")
        pg_version = cursor.fetchone()[0]
        logger.info(f"Kết nối thành công!")
        logger.info(f"PostgreSQL: {pg_version}")

        # Kiểm tra extensions đã cài
        cursor.execute("SELECT extname, extversion FROM pg_extension ORDER BY extname;")
        extensions = cursor.fetchall()
        logger.debug(f"Extensions hiện có: {', '.join(f'{n} v{v}' for n, v in extensions)}")

        return conn, cursor

    except psycopg2.OperationalError as e:
        logger.critical(f"Không thể kết nối database!")
        logger.critical(f"Chi tiết lỗi: {e}")
        logger.debug(traceback.format_exc())
        sys.exit(1)


def count_statements(sql: str) -> int:
    """Đếm số lượng câu lệnh SQL (ước tính qua dấu ;)."""
    # Loại bỏ comment dòng và đếm dấu ;
    lines = [l for l in sql.splitlines() if not l.strip().startswith("--")]
    return "".join(lines).count(";")


def run_sql_file(cursor, filepath: Path, verbose: bool = False) -> dict:
    """
    Đọc và thực thi toàn bộ nội dung một file SQL.
    Trả về dict chứa thông tin kết quả.
    """
    result = {"file": filepath.name, "size": 0, "statements": 0, "elapsed": 0.0}

    sql = filepath.read_text(encoding="utf-8")
    result["size"] = len(sql.encode("utf-8"))
    result["statements"] = count_statements(sql)

    logger.debug(f"  File size: {result['size']:,} bytes")
    logger.debug(f"  Số câu lệnh (ước tính): ~{result['statements']}")

    if verbose:
        # Hiện 5 dòng đầu tiên (không phải comment) để biết file chứa gì
        meaningful_lines = [l for l in sql.splitlines() if l.strip() and not l.strip().startswith("--")]
        preview = "\n    ".join(meaningful_lines[:5])
        logger.debug(f"  Preview SQL:\n    {preview}\n    ...")

    start = time.time()
    cursor.execute(sql)
    result["elapsed"] = time.time() - start

    # Kiểm tra NOTICE messages từ PostgreSQL (hữu ích cho debug)
    if cursor.connection.notices:
        for notice in cursor.connection.notices:
            logger.debug(f"  PG NOTICE: {notice.strip()}")
        cursor.connection.notices.clear()

    return result


def verify_schema(cursor) -> None:
    """Kiểm tra schema sau khi chạy xong: đếm tables, indexes, extensions."""
    logger.info("")
    logger.info("─" * 50)
    logger.info("KIỂM TRA SCHEMA SAU KHI KHỞI TẠO")
    logger.info("─" * 50)

    # Đếm tables
    cursor.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    """)
    tables = [row[0] for row in cursor.fetchall()]
    dim_tables = [t for t in tables if t.startswith("dim_")]
    fact_tables = [t for t in tables if t.startswith("fact_")]
    bridge_tables = [t for t in tables if t.startswith("bridge_")]
    partition_tables = [t for t in tables if any(
        t.startswith(f"{prefix}_20") for prefix in ["fact_traffic_flow", "fact_incident", "fact_risk_pred"]
    )]
    other_tables = [t for t in tables if t not in dim_tables + fact_tables + bridge_tables + partition_tables]

    logger.info(f"  Dimension tables : {len(dim_tables)}")
    for t in dim_tables:
        logger.debug(f"    ✓ {t}")
    logger.info(f"  Fact tables      : {len(fact_tables)}")
    for t in fact_tables:
        logger.debug(f"    ✓ {t}")
    logger.info(f"  Bridge tables    : {len(bridge_tables)}")
    for t in bridge_tables:
        logger.debug(f"    ✓ {t}")
    logger.info(f"  Partitions       : {len(partition_tables)}")
    for t in partition_tables:
        logger.debug(f"    ✓ {t}")
    if other_tables:
        logger.info(f"  Khác             : {len(other_tables)}")
        for t in other_tables:
            logger.debug(f"    ✓ {t}")

    # Đếm indexes
    cursor.execute("""
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY indexname;
    """)
    indexes = cursor.fetchall()
    brin_idx = [i for i in indexes if "USING brin" in i[1].lower()]
    gist_idx = [i for i in indexes if "USING gist" in i[1].lower()]
    btree_idx = [i for i in indexes if "USING btree" in i[1].lower() or "USING" not in i[1].lower()]

    logger.info(f"  Tổng Indexes     : {len(indexes)}")
    logger.info(f"    - BRIN         : {len(brin_idx)}")
    logger.info(f"    - GiST         : {len(gist_idx)}")
    logger.info(f"    - B-Tree       : {len(btree_idx)}")
    for name, defn in indexes:
        logger.debug(f"    ✓ {name}")

    # Extensions
    cursor.execute("SELECT extname, extversion FROM pg_extension ORDER BY extname;")
    extensions = cursor.fetchall()
    logger.info(f"  Extensions       : {len(extensions)}")
    for name, version in extensions:
        logger.debug(f"    ✓ {name} v{version}")


def parse_args():
    parser = argparse.ArgumentParser(description="Khởi tạo schema Data Warehouse cho Smart Traffic IOC")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Hiện chi tiết SQL đang chạy (DEBUG level)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Chỉ kiểm tra file và kết nối, không chạy SQL")
    parser.add_argument("--skip-verify", action="store_true",
                        help="Bỏ qua bước kiểm tra schema sau khi chạy")
    return parser.parse_args()


def main():
    args = parse_args()

    # Nếu --verbose thì console cũng hiện DEBUG
    if args.verbose:
        console_handler.setLevel(logging.DEBUG)

    logger.info("=" * 60)
    logger.info("  SMART TRAFFIC IOC – Database Schema Initialization")
    logger.info(f"  Thời gian: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"  Log file : {LOG_FILE}")
    logger.info("=" * 60)

    # Load .env
    load_env()
    config = get_db_config()

    # Kiểm tra file SQL tồn tại trước khi kết nối DB
    logger.info("")
    logger.info("Kiểm tra file SQL:")
    all_exist = True
    for filename in SQL_FILES:
        filepath = SCRIPT_DIR / filename
        if filepath.exists():
            size = filepath.stat().st_size
            logger.info(f"  ✓ {filename} ({size:,} bytes)")
        else:
            logger.error(f"  ✗ {filename} – KHÔNG TÌM THẤY!")
            all_exist = False

    if not all_exist:
        logger.critical("Một hoặc nhiều file SQL bị thiếu. Dừng lại.")
        sys.exit(1)

    if args.dry_run:
        logger.info("")
        logger.info("[DRY-RUN] Chỉ kiểm tra kết nối, không chạy SQL.")

    # Kết nối DB
    logger.info("")
    conn, cursor = connect_db(config)

    if args.dry_run:
        logger.info("[DRY-RUN] Kết nối OK. Dừng tại đây (không chạy SQL).")
        cursor.close()
        conn.close()
        sys.exit(0)

    # Chạy từng file SQL
    logger.info("")
    logger.info("─" * 50)
    logger.info("BẮT ĐẦU CHẠY SQL")
    logger.info("─" * 50)

    total_start = time.time()
    results = []
    success_count = 0
    failed_files = []

    for i, filename in enumerate(SQL_FILES, 1):
        filepath = SCRIPT_DIR / filename
        logger.info("")
        logger.info(f"[{i}/{len(SQL_FILES)}] {filename}")

        try:
            result = run_sql_file(cursor, filepath, verbose=args.verbose)
            results.append(result)
            success_count += 1
            logger.info(f"  ✓ Thành công ({result['elapsed']:.2f}s, "
                        f"~{result['statements']} statements, "
                        f"{result['size']:,} bytes)")

        except psycopg2.Error as e:
            elapsed = time.time() - (total_start if not results else time.time())
            failed_files.append(filename)
            logger.error(f"  ✗ THẤT BẠI!")
            logger.error(f"    PG Error Code : {e.pgcode or 'N/A'}")
            logger.error(f"    Message       : {e.pgerror or str(e)}")
            logger.debug(f"    Traceback:\n{traceback.format_exc()}")

            # Ghi diagnostics data nếu có
            if hasattr(e, "diag") and e.diag:
                diag = e.diag
                if diag.message_detail:
                    logger.error(f"    Detail        : {diag.message_detail}")
                if diag.message_hint:
                    logger.error(f"    Hint          : {diag.message_hint}")
                if diag.context:
                    logger.error(f"    Context       : {diag.context}")
                if diag.statement_position:
                    logger.error(f"    Position      : char {diag.statement_position}")

    total_elapsed = time.time() - total_start

    # Kiểm tra schema
    if not args.skip_verify and success_count > 0:
        try:
            verify_schema(cursor)
        except Exception as e:
            logger.warning(f"Không thể kiểm tra schema: {e}")

    # Đóng kết nối
    cursor.close()
    conn.close()
    logger.debug("Đã đóng kết nối database.")

    # Tổng kết
    logger.info("")
    logger.info("=" * 60)
    logger.info("  KẾT QUẢ TỔNG HỢP")
    logger.info("=" * 60)
    logger.info(f"  Thành công : {success_count}/{len(SQL_FILES)} file")
    if failed_files:
        logger.error(f"  Thất bại   : {', '.join(failed_files)}")
    logger.info(f"  Tổng thời gian: {total_elapsed:.2f}s")
    if results:
        logger.info(f"  Chi tiết thời gian:")
        for r in results:
            logger.info(f"    {r['file']:<30s} {r['elapsed']:.2f}s")
    logger.info(f"  Log đầy đủ : {LOG_FILE}")
    logger.info("=" * 60)

    if success_count < len(SQL_FILES):
        sys.exit(1)


if __name__ == "__main__":
    main()
