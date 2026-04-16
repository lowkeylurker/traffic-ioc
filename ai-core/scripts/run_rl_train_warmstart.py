"""Entry-point for warmstart RL training (SL -> RL)."""

from __future__ import annotations

from pathlib import Path
import sys
import warnings

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ml.artifacts import get_ml_checkpoint_path, get_ml_preprocessing_path
from src.rl.training.runner import RLTrainingConfig, run_rl_training


# Toggle trực tiếp trong code: True = bật, False = tắt
USE_WINDOW_BALANCING = False
PREDICTION_HORIZON_MINUTES = 15  # Supported: 15 or 30
if PREDICTION_HORIZON_MINUTES not in (15, 30):
    raise ValueError("PREDICTION_HORIZON_MINUTES chỉ được phép là 15 hoặc 30")

ML_RUN_ID = f"manual_h{PREDICTION_HORIZON_MINUTES}"


CONFIG = RLTrainingConfig(
    start_date="2026-03-25",
    end_date="2026-04-16",
    corridor_ids=[136550177913819656,
    392537437542429252,
    646713380690000556,
    647577676530405923,
    988709510142577156,
    1100735735503891924,],
    peak_hours_only=True,
    batch_size=64,
    episodes=24,
    max_steps_per_episode=10000,
    window_size=12,
    eval_ratio=0.2,
    seed=42,
    max_segments=0,
    requested_device="auto",
    gamma=0.99,
    epsilon_start=0.5,
    epsilon_min=0.05,
    epsilon_decay=0.93,
    learning_rate=0.00005,
    warmup_steps=2000,
    replay_capacity=100000,
    target_update=10,
    early_stop_patience=4,
    early_stop_min_delta=0.001,
    early_stop_eval_interval=1,
    early_stop_warmup_episodes=4,
    use_double_dqn=True,
    use_class_aware_reward=False,
    use_window_balancing=USE_WINDOW_BALANCING,
    reward_scale=1.0,
    reward_clip=30.0,
    run_id=f"warmstart_manual_h{PREDICTION_HORIZON_MINUTES}",
    prediction_horizon_minutes=PREDICTION_HORIZON_MINUTES,
    artifacts_path=str(get_ml_preprocessing_path(run_id=ML_RUN_ID)),
    pretrained_model_path=str(get_ml_checkpoint_path(run_id=ML_RUN_ID)),
)


def main() -> None:
    warnings.filterwarnings("ignore")
    print(f"⚖️ Warmstart window balancing: {'ON' if USE_WINDOW_BALANCING else 'OFF'}")
    run_rl_training(mode="warmstart", config=CONFIG)


if __name__ == "__main__":
    main()
