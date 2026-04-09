"""Manual smoke runner for RL inference."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.inference_rl import RLTrafficPredictor, forecast_for_request


def main() -> None:
    print("--- 🚦 HỆ THỐNG DỰ BÁO ĐIỀU PHỐI GIAO THÔNG THÔNG MINH (RL-AGENT) ---")

    try:
        predictor = RLTrafficPredictor()
        request_time = "2026-04-07 18:00:00"
        segment_ids = [857844920435081278]

        df_results = forecast_for_request(
            predictor=predictor,
            segment_ids=segment_ids,
            request_time=request_time,
        )

        if df_results.empty:
            print("⚠️ Không có segment nào đủ điều kiện dự báo trong khung 09:15 - 21:15.")
        else:
            print("\n" + "=" * 110)
            print("🚀 KẾT QUẢ DỰ BÁO 15 PHÚT KẾ TIẾP TỪ REQUEST APP")
            print("=" * 110)
            print(df_results.to_string(index=False))
            print("=" * 110)
            print(f"\n✅ Hoàn tất dự báo cho {len(df_results)} đoạn đường hợp lệ.")
            print("💡 Window_End_Time là mốc cuối của 12 timestep đầu vào; Forecast_For_Time là mốc dự báo kế tiếp (+15 phút).")

    except Exception as exc:
        print(exc)


if __name__ == "__main__":
    main()