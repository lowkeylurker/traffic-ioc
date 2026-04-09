"""
data_loader.py - Optimized Bulk Data Loading

Cung cấp functions để fetch data từ PostgreSQL với hiệu năng cao:
- load_bulk_corridor_data: Kéo toàn bộ dữ liệu của 1 corridor bằng 1 câu SQL.
- process_single_segment: Xử lý nội suy, resample, cyclical encoding cho từng segment.
"""

import pandas as pd

from src.data_access import (
    get_segments_in_corridor,
    is_forecast_mart_enabled,
    load_forecast_mart_by_segments,
    load_warehouse_rows_by_segments,
    maybe_refresh_forecast_mart_for_segments,
)
from src.utils.segment_processing import process_bulk_dataframe
from src.core.database import get_engine

def load_bulk_corridor_data(corridor_id: int, start_date: str, end_date: str, peak_hours_only: bool = True) -> dict:
    """
    Tải và xử lý dữ liệu cho TOÀN BỘ các segments trong một corridor bằng 1 CÂU SQL DUY NHẤT.
    Trả về một Dictionary: {segment_key: DataFrame_đã_xử_lý}
    """
    segment_ids = get_segments_in_corridor(corridor_id)
    if not segment_ids:
        raise ValueError(f"Không tìm thấy segments nào cho Corridor ID {corridor_id}")

    print(f"🛣️ Tìm thấy {len(segment_ids)} segments trong Corridor {corridor_id}.")
    return load_bulk_segment_data(
        segment_ids=segment_ids,
        start_date=start_date,
        end_date=end_date,
        peak_hours_only=peak_hours_only,
    )


def load_bulk_segment_data(segment_ids: list, start_date: str, end_date: str, peak_hours_only: bool = True) -> dict:
    """
    Tải và xử lý dữ liệu cho một DANH SÁCH các segments cụ thể thay vì toàn bộ corridor.
    Trả về một Dictionary: {segment_key: DataFrame_đã_xử_lý}
    """
    engine = get_engine()

    segment_ids = [int(seg_id) for seg_id in segment_ids] if segment_ids else []
    if not segment_ids:
        raise ValueError("Danh sách segment_ids không được rỗng")
    print(f"📍 Đang tải dữ liệu cho {len(segment_ids)} segments.")

    df_bulk = pd.DataFrame()
    if is_forecast_mart_enabled():
        try:
            maybe_refresh_forecast_mart_for_segments(engine, segment_ids, start_date, end_date)
            df_bulk = load_forecast_mart_by_segments(engine, segment_ids, start_date, end_date)
            if not df_bulk.empty:
                print(f"✅ Đã tải {len(df_bulk)} dòng từ forecast mart cho {len(segment_ids)} segments.")
            else:
                print("⚠️ Forecast mart chưa có dữ liệu phù hợp, fallback sang warehouse query.")
        except Exception as e:
            print(f"⚠️ Forecast mart không khả dụng ({e}), fallback sang warehouse query.")

    if df_bulk.empty:
        print("⏳ Đang kéo dữ liệu Bulk từ Warehouse cho danh sách segments... (Vui lòng đợi)")
        df_bulk = load_warehouse_rows_by_segments(segment_ids, start_date, end_date)

    return process_bulk_dataframe(df_bulk, peak_hours_only=peak_hours_only, source_label="DataMart/Warehouse")

if __name__ == "__main__":
    # Test thử kéo toàn bộ 1 Corridor thay vì 1 Segment
    # Bạn hãy thay số 1 bằng corridor_id có thật trong DB của bạn
    test_corridor = load_bulk_corridor_data(corridor_id=646713380690000556, start_date='2026-03-20', end_date='2026-04-07')
    
    if test_corridor:
        sample_seg_id = list(test_corridor.keys())[0]
        print(f"\nKích thước dữ liệu của Segment mẫu ({sample_seg_id}):", test_corridor[sample_seg_id].shape)
        print("Kiểm tra null:\n", test_corridor[sample_seg_id].isnull().sum())