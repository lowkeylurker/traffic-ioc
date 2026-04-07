"""
data_loader.py - Data Loading from Database

Cung cấp functions để fetch data từ PostgreSQL:
- query_traffic_flow(segment_id, start_time, end_time): Fetch fact_traffic_flow
- query_segment_info(segment_id): Fetch dim_segment info
- query_weather(segment_id, timestamp): Fetch weather data
- query_incident_data(segment_id, start_time, end_time): Fetch incident info

Returns pandas DataFrame hoặc structured data.
"""

import pandas as pd
import numpy as np
from sqlalchemy import text
from src.core.database import get_engine

def load_segment_data(
    segment_id: int,
    start_date: str,
    end_date: str,
    peak_hours_only: bool = True,
) -> pd.DataFrame:
    """
    Truy xuất dữ liệu giao thông tích hợp đầy đủ đặc trưng Động và Tĩnh.
    """
    engine = get_engine()
    
    # SQL Query: Join đầy đủ Fact với các Dimension để lấy Đặc trưng Tĩnh 
    query = """
        SELECT
            f.timestamp,
            -- Nhóm Động (Dynamic)
            f.current_speed_kmh,
            f.pcu_volume,
            f.traffic_index,
            f.delay_seconds,
            f.quality_flag,
            f.congestion_level AS target_label, -- Nhãn mục tiêu cho t+1 
            
            -- Nhóm Tĩnh (Static) - Hạ tầng 
            w_dim.default_lane_count,
            f.free_flow_speed_kmh AS static_free_flow,
            w_dim.osm_highway_type,
            
            -- Nhóm Tĩnh (Static) - Ngữ cảnh 
            loc.district,
            d_date.day_of_week,
            shift.shift_code,
            w_weather.severity_level AS weather_severity,
            d_time.time_key -- Dùng để tính sin/cos 
            
        FROM fact_traffic_flow f
        JOIN dim_segment s_dim ON f.segment_key = s_dim.segment_key 
        JOIN dim_way w_dim ON s_dim.way_key = w_dim.way_key 
        JOIN dim_location loc ON s_dim.location_key = loc.location_key 
        JOIN dim_time_of_day d_time ON f.time_key = d_time.time_key 
        JOIN dim_date d_date ON f.date_key = d_date.date_key 
        LEFT JOIN dim_shift shift ON d_time.default_shift_key = shift.shift_key 
        LEFT JOIN dim_weather w_weather ON f.weather_key = w_weather.weather_key 
        
        WHERE f.segment_key = :segment_id
          AND f.timestamp >= :start_date
          AND f.timestamp <= :end_date
        ORDER BY f.timestamp ASC;
    """
    
    df = pd.read_sql(
        text(query),
        engine,
        params={
            "segment_id": segment_id,
            "start_date": start_date,
            "end_date": end_date,
        },
    )
    
    if df.empty:
        return pd.DataFrame()

    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df.set_index('timestamp', inplace=True)

    # 1. Resample & Aggregation (Đảm bảo khung 15p chuẩn TomTom) 
    # Lưu ý: Các biến tĩnh dùng 'first' hoặc 'max' vì chúng không đổi trong 15p
    agg_logic = {
        'current_speed_kmh': 'mean',
        'pcu_volume': 'mean',
        'traffic_index': 'mean',
        'delay_seconds': 'mean',
        'quality_flag': 'mean',
        'target_label': 'max', # Lấy mức kẹt cao nhất ghi nhận được
        'default_lane_count': 'first',
        'static_free_flow': 'first',
        'osm_highway_type': 'first',
        'district': 'first',
        'day_of_week': 'first',
        'shift_code': 'first',
        'weather_severity': 'max',
        'time_key': 'first'
    }
    df = df.resample('15min').agg(agg_logic)

    # 2. Xử lý Lượng giác cho time_key (Cyclical Encoding) 
    # time_key chạy từ 0-1439 đại diện cho phút trong ngày
    df['time_sin'] = np.sin(2 * np.pi * df['time_key'] / 1440)
    df['time_cos'] = np.cos(2 * np.pi * df['time_key'] / 1440)

    # 3. Lọc khung giờ hoạt động (06:00 - 21:00)
    if peak_hours_only:
        df = df.between_time('06:00', '21:00')

    # 4. Imputation (Nội suy dữ liệu khuyết)
    # Các biến liên tục dùng Linear Interpolation
    continuous_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 'delay_seconds', 'quality_flag']
    df[continuous_cols] = df[continuous_cols].interpolate(method='linear')
    
    # Các biến phân loại dùng Forward Fill sau đó Backward Fill
    categorical_cols = ['target_label', 'osm_highway_type', 'district', 'day_of_week', 'shift_code', 'weather_severity']
    df[categorical_cols] = df[categorical_cols].ffill().bfill()
    
    # Lấp nốt các giá trị tĩnh hạ tầng
    static_cols = ['default_lane_count', 'static_free_flow', 'time_sin', 'time_cos']
    df[static_cols] = df[static_cols].ffill().bfill()

    df.reset_index(inplace=True)
    
    return df

def get_segments_in_corridor(corridor_id: int) -> list:
    """
    Truy vấn danh sách các segment_key thuộc về một corridor_key cụ thể.
    Dựa trên schema: dim_corridor -> bridge_corridor_segment -> dim_segment
    """
    engine = get_engine()
    query = """
        SELECT segment_key 
        FROM bridge_corridor_segment 
        WHERE corridor_key = :corridor_id
    """
    df = pd.read_sql(text(query), engine, params={"corridor_id": corridor_id})
    return df['segment_key'].tolist()

def load_corridor_data(corridor_id: int, start_date: str, end_date: str, peak_hours_only: bool = True) -> dict:
    """
    Tải và xử lý dữ liệu cho TOÀN BỘ các segments trong một corridor.
    Trả về một Dictionary: {segment_id: DataFrame}
    """
    # 1. Lấy danh sách segment
    segment_ids = get_segments_in_corridor(corridor_id)
    
    if not segment_ids:
        raise ValueError(f"Không tìm thấy segments nào cho Corridor ID {corridor_id}")
        
    print(f"🛣️ Tìm thấy {len(segment_ids)} segments trong Corridor {corridor_id}. Đang tiến hành kéo dữ liệu...")
    
    # 2. Lấy dữ liệu cho từng segment
    # (Tối ưu: Nếu số lượng quá lớn, có thể chuyển sang câu lệnh SQL dùng WHERE segment_key IN (...))
    corridor_data = {}
    
    for seg_id in segment_ids:
        try:
            # Tái sử dụng hàm load_segment_data đã viết cực kỳ chuẩn xác của chúng ta
            df = load_segment_data(seg_id, start_date, end_date, peak_hours_only)
            corridor_data[seg_id] = df
        except Exception as e:
            print(f"⚠️ Bỏ qua Segment {seg_id} do lỗi dữ liệu: {e}")
            
    return corridor_data

# Test thử hàm nếu chạy file này trực tiếp
if __name__ == "__main__":
    # Thay segment_id và khoảng thời gian bằng dữ liệu thực tế trong DB của bạn
    test_df = load_segment_data(segment_id=8206185629154005, start_date='2026-03-20', end_date='2026-04-07')
    # print(test_df[-10:])  # In ra 5 dòng đầu tiên để kiểm tra
    print("Kích thước dữ liệu:", test_df.shape)
    print("Kiểm tra null:\n", test_df.isnull().sum())
    print(test_df.head())
