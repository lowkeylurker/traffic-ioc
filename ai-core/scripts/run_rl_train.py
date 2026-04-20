"""Backward-compatible RL training entry-point.

Use RL_MODE=warmstart|pure to switch strategy. For explicit scripts, use
`scripts/run_rl_train_warmstart.py` or `scripts/run_rl_train_pure.py`.
"""

from __future__ import annotations

from pathlib import Path
import sys
import warnings

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.training.runner import RLTrainingConfig, run_rl_training


PREDICTION_HORIZON_MINUTES = 15  # Supported: 15 or 30
if PREDICTION_HORIZON_MINUTES not in (15, 30):
    raise ValueError("PREDICTION_HORIZON_MINUTES chỉ được phép là 15 hoặc 30")


CONFIG = RLTrainingConfig(
    start_date="2026-03-20",
    end_date="2026-04-08",
    corridor_ids=[646713380690000556],
    peak_hours_only=True,
    batch_size=64,
    episodes=20,
    max_steps_per_episode=10000,
    window_size=12,
    eval_ratio=0.2,
    seed=42,
    max_segments=0,
    requested_device="auto",
    gamma=0.99,
    epsilon_start=1.0,
    epsilon_min=0.05,
    epsilon_decay=0.97,
    learning_rate=0.00005,
    warmup_steps=2000,
    replay_capacity=100000,
    target_update=10,
    early_stop_patience=0,
    early_stop_min_delta=0.0,
    early_stop_eval_interval=1,
    early_stop_warmup_episodes=0,
    use_double_dqn=True,
    use_class_aware_reward=False,
    reward_scale=1.0,
    reward_clip=30.0,
    run_id=f"warmstart_manual_h{PREDICTION_HORIZON_MINUTES}",
    prediction_horizon_minutes=PREDICTION_HORIZON_MINUTES,
)


def main() -> None:
    warnings.filterwarnings("ignore")
    run_rl_training(mode="warmstart", config=CONFIG)


if __name__ == "__main__":
    main()