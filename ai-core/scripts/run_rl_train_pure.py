"""Entry-point for pure RL training from DW ground-truth.

Usage examples:
  python -m scripts.run_rl_train_pure
  python -m scripts.run_rl_train_pure --profile fast
  python -m scripts.run_rl_train_pure --profile full --device cpu
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
import warnings

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.training.runner import RLTrainingConfig, run_rl_training

CORRIDOR_IDS = [
    136550177913819656,
    392537437542429252,
    646713380690000556,
    647577676530405923,
    988709510142577156,
    1100735735503891924,
]

PROFILE_PRESETS = {
    "fast": {
        "run_id": "pure_fast_gpu",
        "episodes": 30,
        "max_steps_per_episode": 4000,
        "max_segments": 80,
        "batch_size": 96,
        "epsilon_start": 1.0,
        "epsilon_decay": 0.985,
        "epsilon_min": 0.10,
        "learning_rate": 0.0002,
        "replay_capacity": 200000,
        "warmup_steps": 5000,
        "target_update": 8,
        "early_stop_patience": 5,
        "early_stop_eval_interval": 3,
        "early_stop_warmup_episodes": 10,
        "early_stop_min_delta": 0.002,
    },
    "balanced": {
        "run_id": "pure_balanced_gpu",
        "episodes": 100,
        "max_steps_per_episode": 6000,
        "max_segments": 0,
        "batch_size": 128,
        "epsilon_start": 1.0,
        "epsilon_decay": 0.98,
        "epsilon_min": 0.08,
        "learning_rate": 0.00015,
        "replay_capacity": 250000,
        "warmup_steps": 8000,
        "target_update": 8,
        "early_stop_patience": 8,
        "early_stop_eval_interval": 2,
        "early_stop_warmup_episodes": 20,
        "early_stop_min_delta": 0.002,
    },
    "full": {
        "run_id": "pure_full_gpu",
        "episodes": 140,
        "max_steps_per_episode": 8000,
        "max_segments": 0,
        "batch_size": 128,
        "epsilon_start": 1.0,
        "epsilon_decay": 0.985,
        "epsilon_min": 0.06,
        "learning_rate": 0.00012,
        "replay_capacity": 300000,
        "warmup_steps": 10000,
        "target_update": 8,
        "early_stop_patience": 0,
        "early_stop_eval_interval": 2,
        "early_stop_warmup_episodes": 24,
        "early_stop_min_delta": 0.0015,
    },
}


def _resolve_device(requested: str | None) -> str:
    if requested:
        return requested.strip().lower()
    env_device = os.getenv("RL_DEVICE", "").strip().lower()
    if env_device in {"cuda", "cpu", "mps", "auto"}:
        return env_device
    return "cuda"


def _build_config(profile: str, device: str, horizon_minutes: int) -> RLTrainingConfig:
    if horizon_minutes not in (15, 30):
        raise ValueError("horizon_minutes chỉ được phép là 15 hoặc 30")

    preset = PROFILE_PRESETS[profile]
    return RLTrainingConfig(
        start_date="2026-03-25",
        end_date="2026-04-09",
        corridor_ids=CORRIDOR_IDS,
        peak_hours_only=True,
        batch_size=int(preset["batch_size"]),
        episodes=int(preset["episodes"]),
        max_steps_per_episode=int(preset["max_steps_per_episode"]),
        window_size=12,
        eval_ratio=0.2,
        seed=42,
        max_segments=int(preset["max_segments"]),
        requested_device=device,
        gamma=0.99,
        epsilon_start=float(preset["epsilon_start"]),
        epsilon_min=float(preset["epsilon_min"]),
        epsilon_decay=float(preset["epsilon_decay"]),
        learning_rate=float(preset["learning_rate"]),
        warmup_steps=int(preset["warmup_steps"]),
        replay_capacity=int(preset["replay_capacity"]),
        target_update=int(preset["target_update"]),
        early_stop_patience=int(preset["early_stop_patience"]),
        early_stop_min_delta=float(preset["early_stop_min_delta"]),
        early_stop_eval_interval=int(preset["early_stop_eval_interval"]),
        early_stop_warmup_episodes=int(preset["early_stop_warmup_episodes"]),
        use_double_dqn=True,
        use_class_aware_reward=True,
        use_window_balancing=True,
        reward_scale=1.0,
        reward_clip=25.0,
        run_id=f"{str(preset['run_id'])}_h{horizon_minutes}",
        prediction_horizon_minutes=horizon_minutes,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pure RL trainer with fast/balanced/full presets")
    parser.add_argument(
        "--profile",
        choices=("fast", "balanced", "full"),
        default="balanced",
        help="Training preset profile",
    )
    parser.add_argument(
        "--device",
        choices=("auto", "cuda", "cpu", "mps"),
        default=None,
        help="Requested torch device; default resolves to RL_DEVICE env or cuda",
    )
    parser.add_argument(
        "--horizon",
        choices=(15, 30),
        type=int,
        default=15,
        help="Prediction horizon in minutes for training target (15 or 30)",
    )
    return parser.parse_args()


def main() -> None:
    warnings.filterwarnings("ignore")
    args = _parse_args()
    device = _resolve_device(args.device)
    config = _build_config(profile=args.profile, device=device, horizon_minutes=args.horizon)

    print("========================================")
    print(" RL Pure Training Launcher (Python CLI)")
    print("========================================")
    print(f" Profile : {args.profile}")
    print(f" Device  : {device}")
    print(f" Horizon : {args.horizon}m")
    print(f" Run ID  : {config.run_id}")
    print(f" Episodes: {config.episodes}")
    print(f" Batch   : {config.batch_size}")
    print("========================================")

    run_rl_training(mode="pure", config=config)


if __name__ == "__main__":
    main()
