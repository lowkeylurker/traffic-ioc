"""Entry-point for warmstart RL training (SL -> RL)."""

from __future__ import annotations

from pathlib import Path
import sys
import warnings

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.training.runner import RLTrainingConfig, run_rl_training


# Toggle trực tiếp trong code: True = bật, False = tắt
USE_WINDOW_BALANCING = False


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
    use_window_balancing=USE_WINDOW_BALANCING,
    reward_scale=1.0,
    reward_clip=30.0,
    run_id="warmstart_manual",
)


def main() -> None:
    warnings.filterwarnings("ignore")
    print(f"⚖️ Warmstart window balancing: {'ON' if USE_WINDOW_BALANCING else 'OFF'}")
    run_rl_training(mode="warmstart", config=CONFIG)


if __name__ == "__main__":
    main()
