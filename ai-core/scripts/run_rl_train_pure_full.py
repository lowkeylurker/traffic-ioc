"""Entry-point for full pure RL training from DW ground-truth."""

from __future__ import annotations

import os
from pathlib import Path
import sys
import warnings

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def _set_default_env(name: str, value: str) -> None:
    os.environ.setdefault(name, value)


def main() -> None:
    warnings.filterwarnings("ignore")

    _set_default_env(
        "RL_CORRIDOR_IDS",
        "136550177913819656,392537437542429252,646713380690000556,647577676530405923,988709510142577156,1100735735503891924",
    )
    _set_default_env("RL_START_DATE", "2026-03-20")
    _set_default_env("RL_END_DATE", "2026-04-08")
    _set_default_env("RL_PEAK_HOURS_ONLY", "1")
    _set_default_env("RL_MAX_SEGMENTS", "0")
    _set_default_env("RL_EVAL_RATIO", "0.2")
    _set_default_env("RL_SEED", "42")
    _set_default_env("RL_EPISODES", "80")
    _set_default_env("RL_MAX_STEPS_PER_EPISODE", "12000")
    _set_default_env("RL_BATCH_SIZE", "64")
    _set_default_env("RL_WINDOW_SIZE", "12")
    _set_default_env("RL_RUN_ID", "pure_full")
    _set_default_env("RL_EPSILON_START", "1.0")
    _set_default_env("RL_EPSILON_MIN", "0.10")
    _set_default_env("RL_EPSILON_DECAY", "0.995")
    _set_default_env("RL_LEARNING_RATE", "0.0002")
    _set_default_env("RL_REPLAY_CAPACITY", "200000")
    _set_default_env("RL_WARMUP_STEPS", "5000")
    _set_default_env("RL_TARGET_UPDATE", "8")
    _set_default_env("RL_USE_DOUBLE_DQN", "1")
    _set_default_env("RL_USE_CLASS_AWARE_REWARD", "1")
    _set_default_env("RL_REWARD_SCALE", "1.0")
    _set_default_env("RL_REWARD_CLIP", "30.0")
    _set_default_env("RL_EARLY_STOP_PATIENCE", "6")
    _set_default_env("RL_EARLY_STOP_MIN_DELTA", "0.001")
    _set_default_env("RL_EARLY_STOP_EVAL_INTERVAL", "2")
    _set_default_env("RL_EARLY_STOP_WARMUP_EPISODES", "12")

    from src.rl.training.runner import run_rl_training

    run_rl_training(mode="pure")


if __name__ == "__main__":
    main()