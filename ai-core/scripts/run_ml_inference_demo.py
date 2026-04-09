"""Manual smoke runner for ML inference."""

from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ml.inference.predictor import TrafficPredictor
from src.utils.data_loader import load_bulk_corridor_data


def main() -> None:
    print("--- KHỞI ĐỘNG HỆ THỐNG DỰ BÁO THỜI GIAN THỰC ---")

    model_path = "best_traffic_model.pt"
    artifacts_path = "preprocessing_artifacts.pkl"

    try:
        predictor = TrafficPredictor(model_path=model_path, artifacts_path=artifacts_path)

        print("Đang truy xuất dữ liệu gần nhất từ Database...")
        corridor_data = load_bulk_corridor_data(
            corridor_id=646713380690000556,
            start_date="2026-04-07 07:00:00",
            end_date="2026-04-07 10:00:00",
        )

        if corridor_data:
            print(f"\n🛣️ Bắt đầu chạy dự báo cho {len(corridor_data)} segments...")
            all_predictions = []

            for seg_key, df_segment in corridor_data.items():
                if len(df_segment) < 12:
                    continue

                df_input = df_segment.tail(12).copy()
                start_time_of_window = df_input["timestamp"].iloc[0]
                end_time_of_window = df_input["timestamp"].iloc[-1]
                time_diff = end_time_of_window - start_time_of_window
                expected_diff = pd.Timedelta(minutes=165)

                if time_diff != expected_diff:
                    print(f"⚠️ Bỏ qua Segment {seg_key} lúc {end_time_of_window} do dữ liệu thiếu liên tục (nhảy qua đêm).")
                    continue

                current_time = df_input["timestamp"].iloc[-1]
                result = predictor.predict_next_15_mins(df_input)
                all_predictions.append(
                    {
                        "segment_key": seg_key,
                        "current_timestamp": current_time,
                        "predicted_level": result["predicted_level"],
                        "status_description": result["status_description"],
                        "confidence_percentage": result["confidence_percentage"],
                    }
                )

            df_results = pd.DataFrame(all_predictions)
            print("\n" + "=" * 60)
            print("🚀 TỔNG HỢP KẾT QUẢ DỰ BÁO 15 PHÚT TỚI (TOP 5 SEGMENTS)")
            print("=" * 60)
            print(df_results.head().to_string(index=False))
            print("=" * 60)
            print(f"\n✅ Đã hoàn tất dự báo cho {len(df_results)} segments.")
            print("💡 Trong thực tế, df_results này sẽ được dùng để ghi vào bảng fact_predictions trong Data Warehouse hoặc trả về dạng JSON cho API.")

    except FileNotFoundError:
        print("⚠️ LỖI: Chưa tìm thấy file 'best_traffic_model.pt' hoặc 'preprocessing_artifacts.pkl'.")


if __name__ == "__main__":
    main()