"""Benchmark DataMart impact for congestion forecasting.

Compares:
1) Query latency: warehouse join path vs forecast DataMart path.
2) Inference latency: model prediction time on windows loaded by each path.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import statistics
import time
from pathlib import Path
from typing import Any

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.utils.data_loader import load_bulk_corridor_data


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark DataMart before/after")
    parser.add_argument("--corridor-id", type=int, required=True)
    parser.add_argument("--start-date", type=str, required=True, help="YYYY-MM-DD HH:MM:SS")
    parser.add_argument("--end-date", type=str, required=True, help="YYYY-MM-DD HH:MM:SS")
    parser.add_argument("--query-runs", type=int, default=3)
    parser.add_argument("--infer-runs", type=int, default=3)
    parser.add_argument("--max-segments", type=int, default=200)
    parser.add_argument("--model-path", type=str, default="best_traffic_model.pt")
    parser.add_argument("--artifacts-path", type=str, default="preprocessing_artifacts.pkl")
    parser.add_argument("--output-json", type=str, default="")
    return parser.parse_args()


def _is_continuous_12_steps(df_window: pd.DataFrame) -> bool:
    if len(df_window) != 12:
        return False
    start_time = pd.to_datetime(df_window["timestamp"]).iloc[0]
    end_time = pd.to_datetime(df_window["timestamp"]).iloc[-1]
    return (end_time - start_time) == pd.Timedelta(minutes=165)


def _collect_inference_windows(
    corridor_data: dict[Any, pd.DataFrame],
    max_segments: int,
) -> list[pd.DataFrame]:
    windows: list[pd.DataFrame] = []
    for _, df_segment in corridor_data.items():
        if df_segment is None or df_segment.empty or len(df_segment) < 12:
            continue
        df_input = df_segment.sort_values("timestamp").tail(12).copy()
        if not _is_continuous_12_steps(df_input):
            continue
        windows.append(df_input)
        if len(windows) >= max_segments:
            break
    return windows


def _measure_query_latency(
    use_mart: bool,
    corridor_id: int,
    start_date: str,
    end_date: str,
    runs: int,
) -> tuple[dict[Any, pd.DataFrame], list[float]]:
    os.environ["AI_USE_FORECAST_MART"] = "1" if use_mart else "0"

    latencies: list[float] = []
    latest_data: dict[Any, pd.DataFrame] = {}

    for _ in range(runs):
        t0 = time.perf_counter()
        latest_data = load_bulk_corridor_data(
            corridor_id=corridor_id,
            start_date=start_date,
            end_date=end_date,
            peak_hours_only=True,
        )
        latencies.append(time.perf_counter() - t0)

    return latest_data, latencies


def _measure_inference_latency(
    predictor,
    windows: list[pd.DataFrame],
    runs: int,
) -> list[float]:
    if not windows:
        return []

    latencies: list[float] = []
    for _ in range(runs):
        t0 = time.perf_counter()
        for window in windows:
            predictor.predict_next_15_mins(window)
        latencies.append(time.perf_counter() - t0)

    return latencies


def _safe_stats(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {
            "mean_s": None,
            "median_s": None,
            "p95_s": None,
            "min_s": None,
            "max_s": None,
        }

    ordered = sorted(values)
    p95_idx = min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))
    return {
        "mean_s": statistics.mean(values),
        "median_s": statistics.median(values),
        "p95_s": ordered[p95_idx],
        "min_s": min(values),
        "max_s": max(values),
    }


def _summarize_rows(corridor_data: dict[Any, pd.DataFrame]) -> tuple[int, int]:
    segments = len(corridor_data)
    rows = sum(len(df) for df in corridor_data.values()) if corridor_data else 0
    return segments, rows


def _fmt_seconds(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.4f}s"


def main() -> None:
    args = _parse_args()

    print("\n=== DataMart Benchmark: Query + Inference ===")
    print(f"corridor_id={args.corridor_id}")
    print(f"time_range=[{args.start_date} .. {args.end_date}]")
    print(f"query_runs={args.query_runs}, infer_runs={args.infer_runs}, max_segments={args.max_segments}")

    print("\n[1/4] Benchmark query latency: warehouse path...")
    wh_data, wh_query_lat = _measure_query_latency(
        use_mart=False,
        corridor_id=args.corridor_id,
        start_date=args.start_date,
        end_date=args.end_date,
        runs=args.query_runs,
    )

    print("[2/4] Benchmark query latency: datamart path...")
    mart_data, mart_query_lat = _measure_query_latency(
        use_mart=True,
        corridor_id=args.corridor_id,
        start_date=args.start_date,
        end_date=args.end_date,
        runs=args.query_runs,
    )

    wh_segments, wh_rows = _summarize_rows(wh_data)
    mart_segments, mart_rows = _summarize_rows(mart_data)

    wh_windows = _collect_inference_windows(wh_data, max_segments=args.max_segments)
    mart_windows = _collect_inference_windows(mart_data, max_segments=args.max_segments)

    infer_available = Path(args.model_path).exists() and Path(args.artifacts_path).exists()
    wh_infer_lat: list[float] = []
    mart_infer_lat: list[float] = []

    if infer_available:
        print("[3/4] Load predictor and benchmark inference latency...")
        try:
            from src.ml.inference import TrafficPredictor

            predictor = TrafficPredictor(
                model_path=args.model_path,
                artifacts_path=args.artifacts_path,
            )
            wh_infer_lat = _measure_inference_latency(predictor, wh_windows, runs=args.infer_runs)
            mart_infer_lat = _measure_inference_latency(predictor, mart_windows, runs=args.infer_runs)
        except Exception as exc:
            print(f"[3/4] Skip inference benchmark ({exc}).")
    else:
        print("[3/4] Skip inference benchmark (model/artifacts not found).")

    wh_query_stats = _safe_stats(wh_query_lat)
    mart_query_stats = _safe_stats(mart_query_lat)
    wh_infer_stats = _safe_stats(wh_infer_lat)
    mart_infer_stats = _safe_stats(mart_infer_lat)

    print("\n[4/4] Summary")
    print("\nQuery Latency:")
    print(
        f"- warehouse: mean={_fmt_seconds(wh_query_stats['mean_s'])}, "
        f"p95={_fmt_seconds(wh_query_stats['p95_s'])}, segments={wh_segments}, rows={wh_rows}"
    )
    print(
        f"- datamart : mean={_fmt_seconds(mart_query_stats['mean_s'])}, "
        f"p95={_fmt_seconds(mart_query_stats['p95_s'])}, segments={mart_segments}, rows={mart_rows}"
    )

    if wh_query_stats["mean_s"] and mart_query_stats["mean_s"]:
        gain = (wh_query_stats["mean_s"] - mart_query_stats["mean_s"]) / wh_query_stats["mean_s"] * 100.0
        print(f"- query improvement (mean): {gain:.2f}%")

    print("\nInference Latency:")
    print(
        f"- warehouse windows: mean={_fmt_seconds(wh_infer_stats['mean_s'])}, "
        f"p95={_fmt_seconds(wh_infer_stats['p95_s'])}, windows={len(wh_windows)}"
    )
    print(
        f"- datamart windows : mean={_fmt_seconds(mart_infer_stats['mean_s'])}, "
        f"p95={_fmt_seconds(mart_infer_stats['p95_s'])}, windows={len(mart_windows)}"
    )

    if wh_infer_stats["mean_s"] and mart_infer_stats["mean_s"]:
        gain = (wh_infer_stats["mean_s"] - mart_infer_stats["mean_s"]) / wh_infer_stats["mean_s"] * 100.0
        print(f"- inference improvement (mean): {gain:.2f}%")

    payload = {
        "input": {
            "corridor_id": args.corridor_id,
            "start_date": args.start_date,
            "end_date": args.end_date,
            "query_runs": args.query_runs,
            "infer_runs": args.infer_runs,
            "max_segments": args.max_segments,
        },
        "warehouse": {
            "query": wh_query_stats,
            "segments": wh_segments,
            "rows": wh_rows,
            "windows": len(wh_windows),
            "inference": wh_infer_stats,
        },
        "datamart": {
            "query": mart_query_stats,
            "segments": mart_segments,
            "rows": mart_rows,
            "windows": len(mart_windows),
            "inference": mart_infer_stats,
        },
    }

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nSaved benchmark report: {out_path}")


if __name__ == "__main__":
    main()
