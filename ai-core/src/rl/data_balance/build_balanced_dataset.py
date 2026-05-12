"""CLI entrypoint for building a balanced RL dataset."""

from __future__ import annotations

import argparse
from pathlib import Path

from .pipeline import ClassBalanceConfig, build_balanced_dataset_from_path


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build a balanced RL parquet dataset")
    parser.add_argument("--input", required=True, help="Input CSV/Parquet dataset")
    parser.add_argument("--output", required=True, help="Output parquet path")
    parser.add_argument("--report", help="Optional JSON report path")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--window-size", type=int, default=12)
    parser.add_argument("--synthetic-rows-class4", type=int, default=50_000)
    parser.add_argument("--synthetic-rows-class5", type=int, default=20_000)
    parser.add_argument("--disable-ctgan", action="store_true")
    parser.add_argument("--duplicate-mae-threshold", type=float, default=1e-3)
    args = parser.parse_args(argv)

    cfg = ClassBalanceConfig(
        random_seed=args.seed,
        window_size=args.window_size,
        synthetic_rows_class4=args.synthetic_rows_class4,
        synthetic_rows_class5=args.synthetic_rows_class5,
        use_ctgan=not args.disable_ctgan,
        duplicate_mae_threshold=args.duplicate_mae_threshold,
        output_path=args.output,
        report_path=args.report,
    )
    balanced_df, report = build_balanced_dataset_from_path(
        input_path=Path(args.input),
        output_path=Path(args.output),
        config=cfg,
        report_path=Path(args.report) if args.report else None,
    )
    print(f"✅ Balanced dataset written to {args.output}")
    print(f"📊 Rows: {len(balanced_df)} | class counts: {report.after_counts}")
    if args.report:
        print(f"📝 Report written to {args.report}")


if __name__ == "__main__":
    main()
