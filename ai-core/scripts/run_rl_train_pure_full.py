"""Entry-point for full pure RL training from DW ground-truth."""

from __future__ import annotations

from pathlib import Path
import sys
import warnings

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.training.runner import RLTrainingConfig, run_rl_training


CONFIG = RLTrainingConfig(
    start_date="2026-03-20",
    end_date="2026-04-08",
    corridor_ids=[
        136550177913819656,
        392537437542429252,
        646713380690000556,
        647577676530405923,
        988709510142577156,
        1100735735503891924,
    ],
    peak_hours_only=True,
    batch_size=64,
    episodes=80,
    max_steps_per_episode=12000,
    window_size=12,
    eval_ratio=0.2,
    seed=42,
    max_segments=0,
    requested_device="auto",
    gamma=0.99,
    epsilon_start=1.0,
    epsilon_min=0.10,
    epsilon_decay=0.995,
    learning_rate=0.0002,
    warmup_steps=5000,
    replay_capacity=200000,
    target_update=8,
    early_stop_patience=6,
    early_stop_min_delta=0.001,
    early_stop_eval_interval=2,
    early_stop_warmup_episodes=12,
    use_double_dqn=True,
    use_class_aware_reward=True,
    reward_scale=1.0,
    reward_clip=30.0,
    run_id="pure_full",
)


def main() -> None:
    warnings.filterwarnings("ignore")
    run_rl_training(mode="pure", config=CONFIG)


if __name__ == "__main__":
    main()