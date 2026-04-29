"""ETL orchestration wrapper for notebook 01.

This module keeps notebook logic thin by exposing one callable function that:
- loads corridor/segment traffic data using existing data loaders,
- applies the same processing contract,
- validates required output schema,
- writes the output parquet.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd

from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    DYNAMIC_FEATURE_COLS,
    STATIC_MODEL_FEATURE_COLS,
    TARGET_COL,
)
from src.utils.data_loader import load_bulk_corridor_data, load_bulk_segment_data


DEFAULT_CORRIDOR_IDS: list[int] = [
    14146616491042222,
    73904187376705400,
    132965186560956307,
    136550177913819656,
    392537437542429252,
    418854844871232114,
    499090817621594113,
    553923893084418928,
    646713380690000556,
    647577676530405923,
    665064665204826106,
    757793456805938866,
    934115805333902094,
    988709510142577156,
    1100735735503891924,
]


@dataclass
class Notebook01ETLConfig:
    start_date: str
    end_date: str
    output_path: str
    corridor_ids: list[int] | None = None
    segment_ids: list[int] | None = None
    peak_hours_only: bool = True


@dataclass
class Notebook01ETLOutput:
    output_path: str
    rows: int
    columns: int
    class_counts: dict[int, int]
    schema_report: dict[str, object]


def _normalize_ids(values: Iterable[int] | None) -> list[int]:
    if values is None:
        return []
    normalized = [int(v) for v in values]
    # Keep order and remove duplicates.
    return list(dict.fromkeys(normalized))


def _collect_dataframes(config: Notebook01ETLConfig) -> list[pd.DataFrame]:
    all_frames: list[pd.DataFrame] = []

    corridor_ids = _normalize_ids(config.corridor_ids)
    segment_ids = _normalize_ids(config.segment_ids)

    if not corridor_ids and not segment_ids:
        corridor_ids = list(DEFAULT_CORRIDOR_IDS)
        print(
            "⚠️ No corridor_ids/segment_ids provided. Falling back to default corridor list "
            f"({len(corridor_ids)} corridors)."
        )

    for corridor_id in corridor_ids:
        corridor_data = load_bulk_corridor_data(
            corridor_id=corridor_id,
            start_date=config.start_date,
            end_date=config.end_date,
            peak_hours_only=config.peak_hours_only,
        )
        if corridor_data:
            all_frames.append(pd.concat(corridor_data.values(), ignore_index=True))

    if segment_ids:
        segment_data = load_bulk_segment_data(
            segment_ids=segment_ids,
            start_date=config.start_date,
            end_date=config.end_date,
            peak_hours_only=config.peak_hours_only,
        )
        if segment_data:
            all_frames.append(pd.concat(segment_data.values(), ignore_index=True))

    return all_frames


def validate_notebook01_output(df: pd.DataFrame) -> dict[str, object]:
    required_cols = [
        "segment_key",
        "timestamp",
        *DYNAMIC_FEATURE_COLS,
        *STATIC_MODEL_FEATURE_COLS,
        *CATEGORICAL_FEATURE_COLS,
        TARGET_COL,
    ]
    missing = [col for col in required_cols if col not in df.columns]

    class_counts: dict[int, int] = {}
    if TARGET_COL in df.columns:
        labels = pd.to_numeric(df[TARGET_COL], errors="coerce").fillna(0).clip(0, 5).astype(int)
        counts = labels.value_counts().sort_index()
        class_counts = {int(k): int(v) for k, v in counts.items()}

    report = {
        "required_columns": required_cols,
        "missing_columns": missing,
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "class_counts": class_counts,
    }
    if missing:
        raise ValueError(f"Notebook01 ETL output missing required columns: {missing}")
    return report


def run_notebook01_etl(config: Notebook01ETLConfig) -> Notebook01ETLOutput:
    frames = _collect_dataframes(config)
    if not frames:
        raise RuntimeError("No data loaded for notebook 01 ETL. Check corridor_ids/segment_ids and date range.")

    df = pd.concat(frames, ignore_index=True)
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"])

    sort_cols = [col for col in ("segment_key", "timestamp") if col in df.columns]
    if sort_cols:
        df = df.sort_values(sort_cols).reset_index(drop=True)

    # Ensure categorical columns are strings to avoid PyArrow type mismatch
    # (e.g., when some segments have numeric day_of_week and others have strings or 'unknown')
    for col in CATEGORICAL_FEATURE_COLS:
        if col in df.columns:
            df[col] = df[col].astype(str)

    schema_report = validate_notebook01_output(df)

    output_path = Path(config.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)

    return Notebook01ETLOutput(
        output_path=str(output_path),
        rows=int(len(df)),
        columns=int(len(df.columns)),
        class_counts={int(k): int(v) for k, v in schema_report["class_counts"].items()},
        schema_report=schema_report,
    )
