"""Compare metrics between warmstart and pure RL runs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean, pstdev


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _safe_get(mapping: dict, *keys, default=0.0):
    current = mapping
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def _per_class_row(run_name: str, metrics: dict) -> list[dict]:
    rows = []
    per_class = _safe_get(metrics, "eval_summary", "per_class_metrics", default={})
    for cls_idx in range(6):
        cls_key = f"class_{cls_idx}"
        cls_metrics = per_class.get(cls_key, {}) if isinstance(per_class, dict) else {}
        rows.append(
            {
                "run": run_name,
                "class": cls_idx,
                "precision": float(cls_metrics.get("precision", 0.0)),
                "recall": float(cls_metrics.get("recall", 0.0)),
                "f1": float(cls_metrics.get("f1", 0.0)),
                "support": int(cls_metrics.get("support", 0)),
            }
        )
    return rows


def _summarize_run(run_name: str, payload: dict) -> dict:
    eval_summary = payload.get("eval_summary", {}) or {}
    final_summary = payload.get("final_summary", {}) or {}
    config = payload.get("config", {}) or {}

    return {
        "run": run_name,
        "mode": payload.get("mode", "unknown"),
        "seed": config.get("seed", None),
        "episodes": config.get("episodes", None),
        "eval_samples": int(eval_summary.get("num_samples", 0)),
        "eval_accuracy": float(eval_summary.get("accuracy", 0.0)),
        "eval_macro_f1": float(eval_summary.get("macro_f1", 0.0)),
        "eval_minority_recall_35": float(eval_summary.get("minority_recall_35", 0.0)),
        "train_reward_best": float(final_summary.get("best_reward", 0.0)),
        "train_reward_mean": float(mean(payload.get("train_history", {}).get("episode_rewards", [])))
        if payload.get("train_history", {}).get("episode_rewards")
        else 0.0,
    }


def _format_table(rows: list[dict], headers: list[str]) -> str:
    widths = {header: len(header) for header in headers}
    for row in rows:
        for header in headers:
            widths[header] = max(widths[header], len(str(row.get(header, ""))))

    def fmt_row(row: dict) -> str:
        return " | ".join(str(row.get(header, "")).ljust(widths[header]) for header in headers)

    lines = [fmt_row({header: header for header in headers})]
    lines.append("-+-".join("-" * widths[header] for header in headers))
    for row in rows:
        lines.append(fmt_row(row))
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare RL pure vs warmstart metrics")
    parser.add_argument("--pure", required=True, type=Path, help="Path to pure RL metrics JSON")
    parser.add_argument("--warmstart", required=True, type=Path, help="Path to warmstart RL metrics JSON")
    parser.add_argument("--output", type=Path, default=Path("rl_benchmark_comparison.json"), help="Output comparison JSON")
    args = parser.parse_args()

    pure_payload = _load_json(args.pure)
    warmstart_payload = _load_json(args.warmstart)

    pure_summary = _summarize_run("pure", pure_payload)
    warmstart_summary = _summarize_run("warmstart", warmstart_payload)

    comparison = {
        "pure": pure_summary,
        "warmstart": warmstart_summary,
        "deltas": {
            "eval_accuracy": pure_summary["eval_accuracy"] - warmstart_summary["eval_accuracy"],
            "eval_macro_f1": pure_summary["eval_macro_f1"] - warmstart_summary["eval_macro_f1"],
            "eval_minority_recall_35": pure_summary["eval_minority_recall_35"] - warmstart_summary["eval_minority_recall_35"],
            "train_reward_best": pure_summary["train_reward_best"] - warmstart_summary["train_reward_best"],
        },
        "per_class": {
            "pure": _per_class_row("pure", pure_payload),
            "warmstart": _per_class_row("warmstart", warmstart_payload),
        },
    }

    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(comparison, handle, indent=2, ensure_ascii=False)

    print("\n=== RL BENCHMARK COMPARISON ===")
    print(_format_table([pure_summary, warmstart_summary], ["run", "mode", "seed", "episodes", "eval_samples", "eval_accuracy", "eval_macro_f1", "eval_minority_recall_35", "train_reward_best"]))
    print("\n=== DELTAS (pure - warmstart) ===")
    for key, value in comparison["deltas"].items():
        print(f"{key}: {value:+.6f}")
    print(f"\n📝 Comparison JSON saved to: {args.output}")


if __name__ == "__main__":
    main()
