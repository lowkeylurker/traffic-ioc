"""Manual smoke runner for RL inference."""

from __future__ import annotations

import os
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.artifacts import get_rl_checkpoint_path, get_rl_preprocessing_artifacts_path
from src.rl.inference.predictor import RLTrafficPredictor, forecast_for_request


def _parse_segment_ids(raw_value: str | None) -> list[int]:
    if not raw_value:
        return [857844920435081278]
    segment_ids: list[int] = []
    for part in raw_value.split(","):
        value = part.strip()
        if not value:
            continue
        segment_ids.append(int(value))
    if not segment_ids:
        raise ValueError("RL_SEGMENT_IDS không hợp lệ")
    return segment_ids


def main() -> None:
    print("--- 🚦 HỆ THỐNG DỰ BÁO ĐIỀU PHỐI GIAO THÔNG THÔNG MINH (RL-AGENT) ---")

    try:
        run_id = os.getenv("RL_RUN_ID", "pure_full")
        model_path = os.getenv("RL_MODEL_PATH", str(get_rl_checkpoint_path(mode="pure", run_id=run_id)))
        artifacts_path = os.getenv("RL_ARTIFACTS_PATH", str(get_rl_preprocessing_artifacts_path(mode="pure", run_id=run_id)))
        request_time = os.getenv("RL_REQUEST_TIME", "2026-04-07 18:00:00")
        segment_ids = _parse_segment_ids(os.getenv("RL_SEGMENT_IDS"))

        print(f"🏷️ Run ID: {run_id}")
        print(f"📥 Model path: {model_path}")
        print(f"📦 Artifacts path: {artifacts_path}")
        print(f"🕒 Request time: {request_time}")
        print(f"🧭 Segment IDs: {segment_ids}")

        predictor = RLTrafficPredictor(model_path=model_path, artifacts_path=artifacts_path)

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