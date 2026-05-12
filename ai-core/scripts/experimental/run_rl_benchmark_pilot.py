"""Run a small benchmark pilot for pure RL vs warmstart RL."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from statistics import mean, pstdev

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.artifacts import (
    get_rl_benchmark_summary_path,
    get_rl_checkpoint_path,
    get_rl_history_path,
    get_rl_metrics_path,
    get_rl_preprocessing_artifacts_path,
)
from src.ml.artifacts import get_ml_checkpoint_path, get_ml_preprocessing_path
from src.rl.training.runner import RLTrainingConfig, run_rl_training


SEEDS = [42]
EPISODES = 10
BATCH_SIZE = 64
EVAL_RATIO = 0.2
PEAK_HOURS_ONLY = True
START_DATE = "2026-03-20"
END_DATE = "2026-03-24"
MAX_SEGMENTS = 20


def _parse_seeds(raw_value: str | None) -> list[int]:
    if not raw_value:
        return [42]
    seeds: list[int] = []
    for part in raw_value.split(","):
        value = part.strip()
        if not value:
            continue
        seeds.append(int(value))
    if not seeds:
        raise ValueError("RL_BENCHMARK_SEEDS khong hop le")
    return seeds


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _extract_metrics(payload: dict) -> dict:
    eval_summary = payload.get("eval_summary", {}) or {}
    final_summary = payload.get("final_summary", {}) or {}
    train_history = payload.get("train_history", {}) or {}

    episode_rewards = train_history.get("episode_rewards", []) or []
    return {
        "eval_accuracy": float(eval_summary.get("accuracy", 0.0)),
        "eval_macro_f1": float(eval_summary.get("macro_f1", 0.0)),
        "eval_minority_recall_35": float(eval_summary.get("minority_recall_35", 0.0)),
        "best_reward": float(final_summary.get("best_reward", 0.0)),
        "mean_reward": float(mean(episode_rewards)) if episode_rewards else 0.0,
        "num_episodes": int(final_summary.get("num_episodes", len(episode_rewards))),
    }


def main() -> None:
    seeds = SEEDS
    modes = ["pure", "warmstart"]
    benchmark_rows: list[dict] = []

    for seed in seeds:
        for mode in modes:
            run_id = f"{mode}_seed{seed}"
            metrics_path = get_rl_metrics_path(mode=mode, run_id=run_id)
            history_path = get_rl_history_path(mode=mode, run_id=run_id)
            checkpoint_path = get_rl_checkpoint_path(mode=mode, run_id=run_id)
            if mode == "pure":
                config = RLTrainingConfig(
                    start_date=START_DATE,
                    end_date=END_DATE,
                    corridor_ids=[646713380690000556],
                    peak_hours_only=PEAK_HOURS_ONLY,
                    batch_size=BATCH_SIZE,
                    episodes=EPISODES,
                    max_steps_per_episode=10000,
                    window_size=12,
                    eval_ratio=EVAL_RATIO,
                    seed=seed,
                    max_segments=MAX_SEGMENTS,
                    requested_device="auto",
                    gamma=0.99,
                    epsilon_start=1.0,
                    epsilon_min=0.10,
                    epsilon_decay=0.995,
                    learning_rate=0.0002,
                    warmup_steps=5000,
                    replay_capacity=200000,
                    target_update=10,
                    early_stop_patience=0,
                    early_stop_min_delta=0.0,
                    early_stop_eval_interval=1,
                    early_stop_warmup_episodes=0,
                    use_double_dqn=True,
                    use_class_aware_reward=True,
                    reward_scale=1.0,
                    reward_clip=30.0,
                    run_id=run_id,
                    checkpoint_path=str(checkpoint_path),
                    pure_artifacts_path=str(get_rl_preprocessing_artifacts_path(mode=mode, run_id=run_id)),
                    history_path=str(history_path),
                    metrics_out=str(metrics_path),
                )
            else:
                config = RLTrainingConfig(
                    start_date=START_DATE,
                    end_date=END_DATE,
                    corridor_ids=[646713380690000556],
                    peak_hours_only=PEAK_HOURS_ONLY,
                    batch_size=BATCH_SIZE,
                    episodes=EPISODES,
                    max_steps_per_episode=10000,
                    window_size=12,
                    eval_ratio=EVAL_RATIO,
                    seed=seed,
                    max_segments=MAX_SEGMENTS,
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
                    run_id=run_id,
                    checkpoint_path=str(checkpoint_path),
                    pretrained_model_path=str(get_ml_checkpoint_path()),
                    artifacts_path=str(get_ml_preprocessing_path()),
                    history_path=str(history_path),
                    metrics_out=str(metrics_path),
                )

            print(f"\n=== RUN {mode.upper()} | seed={seed} ===")
            run_rl_training(mode=mode, config=config)

            payload = _load_json(metrics_path)
            row = {
                "seed": seed,
                "mode": mode,
                **_extract_metrics(payload),
                "metrics_path": str(metrics_path),
            }
            benchmark_rows.append(row)

    def _aggregate(metric_name: str) -> dict:
        pure_values = [row[metric_name] for row in benchmark_rows if row["mode"] == "pure"]
        warm_values = [row[metric_name] for row in benchmark_rows if row["mode"] == "warmstart"]
        return {
            "pure_mean": float(mean(pure_values)) if pure_values else 0.0,
            "pure_std": float(pstdev(pure_values)) if len(pure_values) > 1 else 0.0,
            "warmstart_mean": float(mean(warm_values)) if warm_values else 0.0,
            "warmstart_std": float(pstdev(warm_values)) if len(warm_values) > 1 else 0.0,
            "delta_mean": float(mean(pure_values) - mean(warm_values)) if pure_values and warm_values else 0.0,
        }

    summary = {
        "config": {
            "seeds": seeds,
            "episodes": EPISODES,
            "batch_size": BATCH_SIZE,
            "eval_ratio": EVAL_RATIO,
            "peak_hours_only": PEAK_HOURS_ONLY,
            "start_date": START_DATE,
            "end_date": END_DATE,
            "max_segments": MAX_SEGMENTS,
        },
        "runs": benchmark_rows,
        "aggregate": {
            "eval_accuracy": _aggregate("eval_accuracy"),
            "eval_macro_f1": _aggregate("eval_macro_f1"),
            "eval_minority_recall_35": _aggregate("eval_minority_recall_35"),
            "best_reward": _aggregate("best_reward"),
            "mean_reward": _aggregate("mean_reward"),
        },
    }

    output_path = get_rl_benchmark_summary_path("rl_benchmark_pilot_summary.json")
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, ensure_ascii=False)

    print("\n=== RL PILOT BENCHMARK SUMMARY ===")
    print(json.dumps(summary["aggregate"], indent=2, ensure_ascii=False))
    print(f"\nPilot summary saved to: {output_path}")


if __name__ == "__main__":
    main()
