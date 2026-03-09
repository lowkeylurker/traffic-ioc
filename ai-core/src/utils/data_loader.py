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
from src.core.database import get_engine

def load_segment_data(segment_id: int, start_date: str, end_date: str) -> pd.DataFrame:
    """
    Truy xuất dữ liệu giao thông của một segment cụ thể và xử lý missing values.
    """
    engine = get_engine()
    
    # SQL Query: Join Fact Table với các Dim Tables
    query = f"""
        SELECT 
            f.timestamp,
            f.current_speed_kmh,
            f.pcu_volume,
            f.traffic_index,
            d.is_peak_hour,
            COALESCE(w.severity_level, 0) AS weather_severity
        FROM fact_traffic_flow f
        LEFT JOIN dim_time_of_day d ON f.time_key = d.time_key
        LEFT JOIN dim_weather w ON f.weather_key = w.weather_key
        WHERE f.segment_key = {segment_id}
          AND f.timestamp >= '{start_date}' 
          AND f.timestamp <= '{end_date}'
        ORDER BY f.timestamp ASC;
    """
    
    # 1. Đọc dữ liệu vào Pandas DataFrame
    df = pd.read_sql(query, engine)
    
    # Đảm bảo cột timestamp là kiểu datetime
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # 2. Xử lý Missing Data (Data Imputation)
    # Resample dữ liệu theo đúng khung 15 phút để phát hiện các khoảng thời gian bị "lủng"
    df.set_index('timestamp', inplace=True)
    df = df.resample('15min').asfreq()
    
    # Dùng nội suy tuyến tính (linear interpolation) cho các biến liên tục
    continuous_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index']
    df[continuous_cols] = df[continuous_cols].interpolate(method='linear')
    
    # Dùng forward fill (lấy giá trị trước đó lấp vào) cho các biến phân loại (categorical)
    categorical_cols = ['is_peak_hour', 'weather_severity']
    df[categorical_cols] = df[categorical_cols].ffill()
    
    # Đổ các giá trị NaN còn sót lại ở những dòng đầu tiên (nếu có) bằng backward fill
    df.bfill(inplace=True)
    
    # Reset index để đưa timestamp trở lại thành cột bình thường
    df.reset_index(inplace=True)
    
    return df

# Test thử hàm nếu chạy file này trực tiếp
if __name__ == "__main__":
    # Thay segment_id và khoảng thời gian bằng dữ liệu thực tế trong DB của bạn
    test_df = load_segment_data(segment_id=1234, start_date='2026-01-01', end_date='2026-01-31')
    print("Kích thước dữ liệu:", test_df.shape)
    print("Kiểm tra null:\n", test_df.isnull().sum())
    print(test_df.head())
