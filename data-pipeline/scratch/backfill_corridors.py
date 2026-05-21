
import os
import sys

# Thêm thư mục gốc vào PYTHONPATH để import được src
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from src.core.database import get_engine
from src.pipelines.ml_features.corridor_pipeline import CorridorTransformer, CorridorPerformanceLoader
from src.core.logger import get_logger

logger = get_logger("backfill")

def backfill():
    engine = get_engine()
    # Danh sách các ngày cần nạp bù (từ ngày 29/04 đến nay)
    dates = [20260429, 20260430, 20260501, 20260502, 20260503, 20260504, 20260505]
    
    # Query tổng quát: Lấy tất cả khung giờ của một ngày
    query = text("""
        WITH active_corridors AS (
            SELECT corridor_key, corridor_name, COALESCE(corridor_version, 1) AS corridor_version
            FROM dim_corridor
            WHERE corridor_version = (SELECT COALESCE(MAX(corridor_version), 1) FROM dim_corridor)
        )
        SELECT 
            bcs.corridor_key, ac.corridor_name, ac.corridor_version,
            f.time_key, f.date_key,
            AVG(f.current_speed_kmh) as avg_speed,
            SUM(f.delay_seconds) as total_delay,
            AVG(CASE WHEN f.free_flow_speed_kmh > 0 THEN f.free_flow_speed_kmh / NULLIF(f.current_speed_kmh, 0) ELSE 1.0 END) as travel_time_index,
            (SELECT s.segment_key FROM fact_traffic_flow s JOIN bridge_corridor_segment bcs2 ON s.segment_key = bcs2.segment_key
             WHERE bcs2.corridor_key = bcs.corridor_key AND s.date_key = f.date_key AND s.time_key = f.time_key
             ORDER BY s.delay_seconds DESC NULLS LAST LIMIT 1) as bottleneck_seg_key,
            COALESCE((SELECT COUNT(*) FROM fact_incident i JOIN bridge_corridor_segment bcs3 ON i.segment_key = bcs3.segment_key
             WHERE bcs3.corridor_key = bcs.corridor_key AND i.date_key = f.date_key AND i.is_active = TRUE), 0) as incident_count
        FROM fact_traffic_flow f
        JOIN bridge_corridor_segment bcs ON f.segment_key = bcs.segment_key
        JOIN active_corridors ac ON ac.corridor_key = bcs.corridor_key
        WHERE f.date_key = :dk
        GROUP BY bcs.corridor_key, ac.corridor_name, ac.corridor_version, f.time_key, f.date_key
    """)

    transformer = CorridorTransformer()
    loader = CorridorPerformanceLoader(engine=engine)

    for dk in dates:
        logger.info(f"--- Processing date: {dk} ---")
        try:
            with engine.connect() as conn:
                result = conn.execute(query, {"dk": dk})
                rows = [dict(r._mapping) for r in result]
            
            if not rows:
                logger.warning(f"No traffic flow data found for date_key={dk}")
                continue
                
            records = transformer.transform(rows)
            count = loader.load(records)
            logger.info(f"✅ Successfully backfilled {count} corridor records for {dk}")
        except Exception as e:
            logger.error(f"❌ Failed to backfill date {dk}: {e}")

if __name__ == "__main__":
    backfill()
