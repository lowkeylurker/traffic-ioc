"""Manual smoke runner for RL inference."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ml.artifacts import get_ml_preprocessing_path
from src.rl.artifacts import get_rl_checkpoint_path, get_rl_preprocessing_artifacts_path
from src.rl.inference.predictor import RLTrafficPredictor, forecast_for_request


# ===== DEFAULT INFERENCE PROFILE =====
# Chuyển nhanh giữa 2 cấu hình bằng cách đổi INFERENCE_PROFILE.
# - "warmstart": SL -> RL (mặc định)
# - "pure": RL thuần túy
INFERENCE_PROFILE = "warmstart"  # "warmstart" hoặc "pure"

# ===== SL -> RL (warmstart) =====
WARMSTART_RUN_ID: str | None = None
WARMSTART_MODEL_PATH = str(get_rl_checkpoint_path(mode="warmstart", run_id=WARMSTART_RUN_ID))
WARMSTART_ARTIFACTS_PATH = str(get_ml_preprocessing_path())

# ===== Pure RL =====
PURE_RUN_ID: str | None = "pure_full_gpu"
PURE_MODEL_PATH = str(get_rl_checkpoint_path(mode="pure", run_id=PURE_RUN_ID))
PURE_ARTIFACTS_PATH = str(get_rl_preprocessing_artifacts_path(mode="pure", run_id=PURE_RUN_ID))

if INFERENCE_PROFILE == "warmstart":
    RUN_ID = WARMSTART_RUN_ID or ""
    MODEL_PATH = WARMSTART_MODEL_PATH
    ARTIFACTS_PATH = WARMSTART_ARTIFACTS_PATH
else:
    RUN_ID = PURE_RUN_ID or ""
    MODEL_PATH = PURE_MODEL_PATH
    ARTIFACTS_PATH = PURE_ARTIFACTS_PATH

REQUEST_TIME = "2026-04-09 09:30:00"
SEGMENT_IDS = [857844920435081278]


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
        run_id = RUN_ID
        model_path = MODEL_PATH
        artifacts_path = ARTIFACTS_PATH
        request_time = REQUEST_TIME
        segment_ids = SEGMENT_IDS

        print(f"🏷️ Run ID: {run_id}")
        print(f"🧪 Inference profile: {INFERENCE_PROFILE}")
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