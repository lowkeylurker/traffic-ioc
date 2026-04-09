"""Entry-point for pure RL training from DW ground-truth."""

from __future__ import annotations

from pathlib import Path
import sys
import warnings

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.training.runner import run_rl_training


def main() -> None:
    warnings.filterwarnings("ignore")
    run_rl_training(mode="pure")


if __name__ == "__main__":
    main()
