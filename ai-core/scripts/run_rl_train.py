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

from src.rl.training.runner import resolve_mode, run_rl_training


def main() -> None:
    warnings.filterwarnings("ignore")
    mode = resolve_mode(default_mode="warmstart")
    run_rl_training(mode=mode)


if __name__ == "__main__":
    main()