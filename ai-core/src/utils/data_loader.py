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
from sqlalchemy import text
from src.core.database import get_engine

def load_segment_data(
    segment_id: int,
    start_date: str,
    end_date: str,
    peak_hours_only: bool = True,
) -> pd.DataFrame:
    """
    Truy xuất dữ liệu giao thông của một segment cụ thể và xử lý missing values.

    Args:
        segment_id: Mã segment cần truy xuất.
        start_date: Thời gian bắt đầu (YYYY-MM-DD hoặc datetime string).
        end_date: Thời gian kết thúc (YYYY-MM-DD hoặc datetime string).
        peak_hours_only: Chỉ giữ dữ liệu trong khung ETL hoạt động 06:00-21:00.
    """
    engine = get_engine()
    
    # SQL Query: Join Fact Table với các Dim Tables
    query = """
        SELECT
            f.timestamp,
            f.current_speed_kmh,
            f.pcu_volume,
            f.traffic_index,
            f.delay_seconds,
            COALESCE(s.is_peak_hour, FALSE) AS is_peak_hour,
            COALESCE(w.severity_level, 0) AS weather_severity
        FROM fact_traffic_flow f
        LEFT JOIN dim_time_of_day d ON f.time_key = d.time_key
        LEFT JOIN dim_shift s ON d.default_shift_key = s.shift_key
        LEFT JOIN dim_weather w ON f.weather_key = w.weather_key
        WHERE f.segment_key = :segment_id
          AND f.timestamp >= :start_date
          AND f.timestamp <= :end_date
        ORDER BY f.timestamp ASC;
    """
    
    # 1. Đọc dữ liệu vào Pandas DataFrame
    df = pd.read_sql(
        text(query),
        engine,
        params={
            "segment_id": segment_id,
            "start_date": start_date,
            "end_date": end_date,
        },
    )
    # Đảm bảo cột timestamp là kiểu datetime
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # 2. Xử lý Missing Data (Data Imputation)
    # Resample dữ liệu theo đúng khung 15 phút để phát hiện các khoảng thời gian bị "lủng"
    df.set_index('timestamp', inplace=True)
    df = df.resample('15min').agg({
        'current_speed_kmh': 'mean',  # Lấy trung bình vận tốc trong 15 phút
        'pcu_volume': 'mean',         # Lấy trung bình lưu lượng
        'traffic_index': 'mean',      # Lấy trung bình chỉ số kẹt xe
        'delay_seconds': 'mean',      # Lấy trung bình thời gian trì hoãn
        'is_peak_hour': 'max',        # Ưu tiên True: Nếu có bất kỳ lúc nào trong 15p là giờ cao điểm -> True
        'weather_severity': 'max'     # Lấy mức độ thời tiết xấu nhất ghi nhận trong 15p đó
    })

    if peak_hours_only:
        minute_of_day = df.index.hour * 60 + df.index.minute
        is_active_window = (minute_of_day >= 6 * 60) & (minute_of_day <= 21 * 60)
        df = df[is_active_window]

    total_rows = len(df)
    missing_speeds = df['current_speed_kmh'].isnull().sum()
    missing_ratio = (missing_speeds / total_rows) * 100
    
    print(f"\n📊 THỐNG KÊ CHẤT LƯỢNG DỮ LIỆU (Segment {segment_id}):")
    print(f"- Tổng số khung thời gian: {total_rows}")
    print(f"- Số khung bị khuyết dữ liệu (NaN): {missing_speeds}")
    print(f"- Tỷ lệ khuyết: {missing_ratio:.2f}%")
    
    if missing_ratio > 30:
        print("⚠️ CẢNH BÁO: Dữ liệu bị khuyết quá 30%, kết quả dự báo có thể bị nhiễu!")
    print("-" * 50)
    # ---------------------------------------------------------

    print(df[0:100])  # In ra 5 dòng đầu tiên để kiểm tra
    
    # Dùng nội suy tuyến tính (linear interpolation) cho các biến liên tục
    continuous_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 'delay_seconds']
    df[continuous_cols] = df[continuous_cols].interpolate(method='linear')
    
    # Dùng forward fill (lấy giá trị trước đó lấp vào) cho các biến phân loại (categorical)
    categorical_cols = ['is_peak_hour', 'weather_severity']
    df[categorical_cols] = df[categorical_cols].ffill()
    
    # Đổ các giá trị NaN còn sót lại ở những dòng đầu tiên (nếu có) bằng backward fill
    df.bfill(inplace=True)
    
    # Reset index để đưa timestamp trở lại thành cột bình thường.
    # Gán trực tiếp từ index rồi drop index để tránh lỗi trùng tên cột.
    df['timestamp'] = df.index
    df.reset_index(drop=True, inplace=True)
    
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
    test_df = load_segment_data(segment_id=8206185629154005, start_date='2026-03-09', end_date='2026-03-15')
    print(test_df[0:10])  # In ra 5 dòng đầu tiên để kiểm tra
    print("Kích thước dữ liệu:", test_df.shape)
    print("Kiểm tra null:\n", test_df.isnull().sum())
    print(test_df.head())
