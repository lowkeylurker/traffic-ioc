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
    _set_default_env("RL_EPISODES", "50")
    _set_default_env("RL_BATCH_SIZE", "64")
    _set_default_env("RL_WINDOW_SIZE", "12")
    _set_default_env("RL_RUN_ID", "pure_full")

    from src.rl.training.runner import run_rl_training

    run_rl_training(mode="pure")


if __name__ == "__main__":
    main()