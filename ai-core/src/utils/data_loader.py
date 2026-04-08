"""
data_loader.py - Optimized Bulk Data Loading

Cung cấp functions để fetch data từ PostgreSQL với hiệu năng cao:
- load_bulk_corridor_data: Kéo toàn bộ dữ liệu của 1 corridor bằng 1 câu SQL.
- process_single_segment: Xử lý nội suy, resample, cyclical encoding cho từng segment.
"""

import pandas as pd
import numpy as np
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
import time
from src.core.database import get_engine


def _read_sql_with_retry(sql, engine, params: dict, max_retries: int = 3, retry_delay_sec: float = 2.0) -> pd.DataFrame:
    """Thử lại read_sql khi gặp lỗi kết nối tạm thời (SSL EOF, connection reset)."""
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            return pd.read_sql(sql, engine, params=params)
        except OperationalError as exc:
            last_error = exc
            # Force SQLAlchemy reconnect cleanly on the next attempt.
            engine.dispose()
            if attempt >= max_retries:
                break
            print(
                f"⚠️ Lỗi kết nối DB (lần {attempt}/{max_retries}): {exc}. "
                f"Đang thử lại sau {retry_delay_sec:.1f}s..."
            )
            time.sleep(retry_delay_sec)

    raise last_error

def process_single_segment(df_segment: pd.DataFrame, peak_hours_only: bool = True) -> tuple[pd.DataFrame, int]:
    """
    Hàm Helper: Chịu trách nhiệm dọn dẹp, nội suy và Lượng giác hóa 
    cho MỘT segment duy nhất sau khi đã kéo từ Database lên RAM.
    """
    # Đặt timestamp làm Index để dùng hàm resample
    df_segment['timestamp'] = pd.to_datetime(df_segment['timestamp'])
    df_segment.set_index('timestamp', inplace=True)

    # 1. Resample & Aggregation
    agg_logic = {
        'segment_key': 'first', # Bắt buộc giữ lại ID của đoạn đường
        'current_speed_kmh': 'mean',
        'pcu_volume': 'mean',
        'traffic_index': 'mean',
        'delay_seconds': 'mean',
        'quality_flag': 'mean',
        'target_label': 'max', 
        'default_lane_count': 'first',
        'static_free_flow': 'first',
        'osm_highway_type': 'first',
        'district': 'first',
        'day_of_week': 'first',
        'shift_code': 'first',
        'weather_severity': 'max',
    }
    
    # Resample theo khung 15 phút
    df = df_segment.resample('15min').agg(agg_logic)

    # 2. Xử lý Lượng giác cho time_key (Cyclical Encoding)
    df['time_key'] = df.index.hour * 60 + df.index.minute
    df['time_sin'] = np.sin(2 * np.pi * df['time_key'] / 1440)
    df['time_cos'] = np.cos(2 * np.pi * df['time_key'] / 1440)

    # 3. Lọc khung giờ hoạt động (06:00 - 21:00)
    if peak_hours_only:
        df = df.between_time('06:00', '21:00')

    # 4. Imputation (Nội suy dữ liệu khuyết)
    continuous_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 'delay_seconds', 'quality_flag']
    df[continuous_cols] = df[continuous_cols].interpolate(method='linear')
    
    categorical_cols = ['osm_highway_type', 'district', 'day_of_week', 'shift_code']
    df[categorical_cols] = df[categorical_cols].ffill().bfill()
    df['weather_severity'] = df['weather_severity'].ffill().bfill()
    
    static_cols = ['segment_key', 'default_lane_count', 'static_free_flow', 'time_sin', 'time_cos']
    df[static_cols] = df[static_cols].ffill().bfill()

    # Sau khi xử lý đặc trưng, loại bỏ các mốc không có nhãn mục tiêu để tránh label noise khi train
    rows_before_drop = len(df)
    df = df[df['target_label'].notna()].copy()
    dropped_rows = rows_before_drop - len(df)

    # Hoàn tất điền khuyết cho đặc trưng đầu vào, không đụng vào target_label
    df[continuous_cols] = df[continuous_cols].interpolate(method='linear').fillna(0)
    df[categorical_cols] = df[categorical_cols].fillna('unknown')
    df[static_cols] = df[static_cols].fillna(0)
    df['weather_severity'] = df['weather_severity'].fillna(0)

    # Reset index và ép kiểu dữ liệu cho sạch sẽ
    df.reset_index(inplace=True)
    df['segment_key'] = df['segment_key'].astype(np.int64)
    
    return df, dropped_rows

def get_segments_in_corridor(corridor_id: int) -> list:
    """Truy vấn danh sách các segment_key thuộc về một corridor_key cụ thể."""
    engine = get_engine()
    query = """
        SELECT DISTINCT ftf.segment_key 
        FROM fact_traffic_flow ftf
        LEFT JOIN bridge_corridor_segment bcs ON ftf.segment_key = bcs.segment_key
        WHERE bcs.corridor_key = :corridor_id
    """
    df = _read_sql_with_retry(text(query), engine, params={"corridor_id": corridor_id})
    return df['segment_key'].tolist()

def load_bulk_corridor_data(corridor_id: int, start_date: str, end_date: str, peak_hours_only: bool = True) -> dict:
    """
    Tải và xử lý dữ liệu cho TOÀN BỘ các segments trong một corridor bằng 1 CÂU SQL DUY NHẤT.
    Trả về một Dictionary: {segment_key: DataFrame_đã_xử_lý}
    """
    engine = get_engine()
    
    # 1. Lấy danh sách segment
    segment_ids = get_segments_in_corridor(corridor_id)
    if not segment_ids:
        raise ValueError(f"Không tìm thấy segments nào cho Corridor ID {corridor_id}")
        
    print(f"🛣️ Tìm thấy {len(segment_ids)} segments trong Corridor {corridor_id}.")
    print("⏳ Đang kéo dữ liệu Bulk từ Database... (Vui lòng đợi vài giây)")
    
    # 2. Câu SQL Gom cụm (Chú ý: Đã thêm f.segment_key vào SELECT và dùng mệnh đề IN)
    query = """
        SELECT
            f.segment_key,
            f.timestamp,
            f.current_speed_kmh,
            f.pcu_volume,
            f.traffic_index,
            f.delay_seconds,
            f.quality_flag,
            f.congestion_level AS target_label,
            
            w_dim.default_lane_count,
            f.free_flow_speed_kmh AS static_free_flow,
            w_dim.osm_highway_type,
            
            loc.district,
            d_date.day_of_week,
            shift.shift_code,
            w_weather.severity_level AS weather_severity
            
        FROM fact_traffic_flow f
        JOIN dim_segment s_dim ON f.segment_key = s_dim.segment_key 
        JOIN dim_way w_dim ON s_dim.way_key = w_dim.way_key 
        JOIN dim_location loc ON s_dim.location_key = loc.location_key 
        JOIN dim_time_of_day d_time ON f.time_key = d_time.time_key 
        JOIN dim_date d_date ON f.date_key = d_date.date_key 
        LEFT JOIN dim_shift shift ON d_time.default_shift_key = shift.shift_key 
        LEFT JOIN dim_weather w_weather ON f.weather_key = w_weather.weather_key 
        
        WHERE f.segment_key IN :segment_ids
          AND f.timestamp >= :start_date
          AND f.timestamp <= :end_date
        ORDER BY f.segment_key, f.timestamp ASC;
    """
    
    # Kéo 1 cục DataFrame siêu to khổng lồ về RAM
    # Lưu ý: SQLAlchemy yêu cầu tuple() cho mệnh đề IN
    df_bulk = _read_sql_with_retry(
        text(query),
        engine,
        {
            "segment_ids": tuple(segment_ids),
            "start_date": start_date,
            "end_date": end_date,
        },
    )
    
    if df_bulk.empty:
        print("⚠️ Không có dữ liệu nào trong khoảng thời gian này.")
        return {}

    print(f"✅ Đã tải xong {len(df_bulk)} dòng dữ liệu thô. Đang tiến hành xử lý song song...")

    # 3. Phân rã và Xử lý trên RAM bằng Pandas Groupby (Cực nhanh)
    corridor_data = {}
    total_dropped_target_rows = 0
    segments_with_dropped_targets = 0
    empty_after_drop = 0
    segment_drop_stats = []
    grouped = df_bulk.groupby('segment_key')
    
    for seg_id, group_df in grouped:
        try:
            processed_df, dropped_rows = process_single_segment(group_df.copy(), peak_hours_only)
            if dropped_rows > 0:
                total_dropped_target_rows += dropped_rows
                segments_with_dropped_targets += 1

            total_rows_before_drop = len(processed_df) + dropped_rows
            drop_ratio_pct = (dropped_rows / total_rows_before_drop * 100.0) if total_rows_before_drop > 0 else 0.0
            segment_drop_stats.append(
                {
                    'segment_key': int(seg_id),
                    'rows_before_drop': int(total_rows_before_drop),
                    'rows_dropped': int(dropped_rows),
                    'drop_ratio_pct': float(drop_ratio_pct),
                }
            )

            if processed_df.empty:
                empty_after_drop += 1
                continue

            corridor_data[seg_id] = processed_df
        except Exception as e:
            print(f"⚠️ Bỏ qua Segment {seg_id} do lỗi xử lý dữ liệu: {e}")

    if total_dropped_target_rows > 0:
        print(
            "⚠️ Tổng hợp làm sạch target_label: "
            f"đã loại bỏ {total_dropped_target_rows} dòng ở {segments_with_dropped_targets} segments."
        )

        top_dropped_segments = sorted(
            segment_drop_stats,
            key=lambda x: (x['drop_ratio_pct'], x['rows_dropped']),
            reverse=True,
        )[:10]
        if top_dropped_segments:
            print("📉 Top segments bị drop target_label cao nhất (theo tỷ lệ):")
            for item in top_dropped_segments:
                print(
                    f"   - Segment {item['segment_key']}: "
                    f"drop {item['rows_dropped']}/{item['rows_before_drop']} "
                    f"({item['drop_ratio_pct']:.2f}%)"
                )

    if empty_after_drop > 0:
        print(f"⚠️ Có {empty_after_drop} segments rỗng sau khi loại bỏ target_label NaN nên đã được bỏ qua.")
            
    print(f"🚀 Hoàn tất xử lý {len(corridor_data)} segments thành công!")
    return corridor_data

if __name__ == "__main__":
    # Test thử kéo toàn bộ 1 Corridor thay vì 1 Segment
    # Bạn hãy thay số 1 bằng corridor_id có thật trong DB của bạn
    test_corridor = load_bulk_corridor_data(corridor_id=646713380690000556, start_date='2026-03-20', end_date='2026-04-07')
    
    if test_corridor:
        sample_seg_id = list(test_corridor.keys())[0]
        print(f"\nKích thước dữ liệu của Segment mẫu ({sample_seg_id}):", test_corridor[sample_seg_id].shape)
        print("Kiểm tra null:\n", test_corridor[sample_seg_id].isnull().sum())