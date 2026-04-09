"""Run a small benchmark pilot for pure RL vs warmstart RL."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from statistics import mean, pstdev

ROOT_DIR = Path(__file__).resolve().parents[1]

from src.rl.artifacts import (
    get_rl_benchmark_summary_path,
    get_rl_checkpoint_path,
    get_rl_history_path,
    get_rl_metrics_path,
)


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
        raise ValueError("RL_BENCHMARK_SEEDS không hợp lệ")
    return seeds


def _run_module(module_name: str, env: dict[str, str]) -> None:
    command = [sys.executable, "-m", module_name]
    subprocess.run(command, cwd=ROOT_DIR, env=env, check=True)


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
    parser = argparse.ArgumentParser(description="Run a pilot benchmark for pure RL vs warmstart RL")
    parser.add_argument("--seeds", type=str, default=os.getenv("RL_BENCHMARK_SEEDS", "42"), help="Comma-separated seeds")
    parser.add_argument("--episodes", type=int, default=int(os.getenv("RL_BENCHMARK_EPISODES", "10")), help="Episodes per run")
    parser.add_argument("--batch-size", type=int, default=int(os.getenv("RL_BENCHMARK_BATCH_SIZE", "64")), help="Batch size")
    parser.add_argument("--eval-ratio", type=float, default=float(os.getenv("RL_BENCHMARK_EVAL_RATIO", "0.2")), help="Eval split ratio")
    parser.add_argument("--peak-hours-only", type=str, default=os.getenv("RL_PEAK_HOURS_ONLY", "1"), help="1 or 0")
    parser.add_argument("--start-date", type=str, default=os.getenv("RL_BENCHMARK_START_DATE", "2026-03-20"), help="Benchmark start date")
    parser.add_argument("--end-date", type=str, default=os.getenv("RL_BENCHMARK_END_DATE", "2026-03-24"), help="Benchmark end date")
    parser.add_argument("--max-segments", type=int, default=int(os.getenv("RL_BENCHMARK_MAX_SEGMENTS", "20")), help="Max segments per corridor for smoke mode")
    parser.add_argument("--output", type=Path, default=Path("rl_benchmark_pilot_summary.json"), help="Output summary JSON")
    args = parser.parse_args()

    seeds = _parse_seeds(args.seeds)
    modes = ["pure", "warmstart"]
    benchmark_rows: list[dict] = []

    for seed in seeds:
        for mode in modes:
            run_id = f"{mode}_seed{seed}"
            metrics_path = get_rl_metrics_path(mode=mode, run_id=run_id)
            history_path = get_rl_history_path(mode=mode, run_id=run_id)
            checkpoint_path = get_rl_checkpoint_path(mode=mode, run_id=run_id)

            env = os.environ.copy()
            env.update(
                {
                    "RL_MODE": mode,
                    "RL_SEED": str(seed),
                    "RL_RUN_ID": run_id,
                    "RL_EPISODES": str(args.episodes),
                    "RL_BATCH_SIZE": str(args.batch_size),
                    "RL_EVAL_RATIO": str(args.eval_ratio),
                    "RL_PEAK_HOURS_ONLY": str(args.peak_hours_only),
                    "RL_START_DATE": str(args.start_date),
                    "RL_END_DATE": str(args.end_date),
                    "RL_MAX_SEGMENTS": str(args.max_segments),
                    "RL_METRICS_OUT": str(metrics_path),
                    "RL_HISTORY_OUT": str(history_path),
                    "RL_CHECKPOINT_PATH": str(checkpoint_path),
                }
            )

            module_name = "scripts.run_rl_train_pure" if mode == "pure" else "scripts.run_rl_train_warmstart"
            print(f"\n=== RUN {mode.upper()} | seed={seed} ===")
            _run_module(module_name, env)

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
            "episodes": args.episodes,
            "batch_size": args.batch_size,
            "eval_ratio": args.eval_ratio,
            "peak_hours_only": args.peak_hours_only == "1",
            "start_date": args.start_date,
            "end_date": args.end_date,
            "max_segments": args.max_segments,
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

    output_path = args.output if args.output.is_absolute() else get_rl_benchmark_summary_path(args.output.name)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, ensure_ascii=False)

    print("\n=== RL PILOT BENCHMARK SUMMARY ===")
    print(json.dumps(summary["aggregate"], indent=2, ensure_ascii=False))
    print(f"\n📝 Pilot summary saved to: {output_path}")


if __name__ == "__main__":
    main()
