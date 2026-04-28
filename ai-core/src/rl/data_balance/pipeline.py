"""End-to-end RL class balancing pipeline.

The pipeline follows the class balance plan documented in
`ai-core/docs/CAN_BANG_CLASS.md` and `ai-core/docs/Cat_tia_va_Sinh_them_du_lieu.md`.

Design goals:
- Undersample classes 0, 1, 2 using anchor class 3 and capped probabilities.
- Preserve class 3 rows exactly.
- Oversample classes 4, 5 with configurable synthetic generation.
- Sanity-check synthetic rows before merging.
- Export the final dataset as parquet for RL training.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
import json
import math

import numpy as np
import pandas as pd

from src.features.temporal_features import create_temporal_features
from src.ml.feature_contract import CATEGORICAL_FEATURE_COLS, TARGET_COL, NUM_CLASSES, WINDOW_STEP_MINUTES

try:  # Optional dependency: SDV/CTGAN is allowed but not required for tests.
    from sdv.single_table import CTGANSynthesizer  # type: ignore

    HAS_CTGAN = True
except Exception:  # pragma: no cover - optional dependency
    CTGANSynthesizer = None  # type: ignore
    HAS_CTGAN = False


@dataclass
class ClassBalanceConfig:
    """Runtime configuration for class balancing."""

    target_col: str = TARGET_COL
    anchor_class: int = 3
    majority_cap_multiplier: float = 2.5
    transition_multiplier: float = 1.30
    duplicate_multiplier: float = 0.20
    duplicate_mae_threshold: float = 1e-3
    random_seed: int = 42
    window_size: int = 12
    synthetic_rows_class4: int = 50_000
    synthetic_rows_class5: int = 20_000
    synthetic_noise_pct: float = 0.02
    use_ctgan: bool = True
    output_path: str | None = None
    report_path: str | None = None
    parquet_engine: str = "auto"


@dataclass
class BalanceReport:
    """Structured summary for the balancing run."""

    applied: bool
    reason: str
    seed: int
    before_counts: dict[int, int] = field(default_factory=dict)
    after_counts: dict[int, int] = field(default_factory=dict)
    keep_probabilities: dict[int, float] = field(default_factory=dict)
    stage_counts: dict[str, int] = field(default_factory=dict)
    removed_rows: dict[str, int] = field(default_factory=dict)
    output_path: str | None = None
    report_path: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sort_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    sort_cols = [col for col in ("segment_key", "timestamp") if col in df.columns]
    if sort_cols:
        return df.sort_values(by=sort_cols).reset_index(drop=True)
    return df.reset_index(drop=True)


def _ensure_congestion_label(df: pd.DataFrame, target_col: str) -> pd.Series:
    if target_col not in df.columns:
        raise ValueError(f"Missing target column: {target_col}")
    labels = pd.to_numeric(df[target_col], errors="coerce").fillna(-1).astype(np.int64)
    return labels.clip(0, NUM_CLASSES - 1)


def _class_counts(df: pd.DataFrame, target_col: str) -> dict[int, int]:
    labels = _ensure_congestion_label(df, target_col)
    counts = np.bincount(labels.to_numpy(), minlength=NUM_CLASSES).astype(int)
    return {cls: int(counts[cls]) for cls in range(NUM_CLASSES)}


def _infer_feature_columns(df: pd.DataFrame) -> tuple[list[str], list[str], list[str]]:
    """Return (numeric_cols, categorical_cols, excluded_cols).

    The pipeline mostly works on row-level features. Numeric columns are used
    for duplicate detection and Gaussian jitter. Categorical columns are kept
    intact unless they already belong to the core contract.
    """

    excluded = {
        "segment_key",
        "timestamp",
        TARGET_COL,
        "source_stage",
        "synthetic_flag",
        "sanity_check_passed",
        "balance_seed",
    }
    excluded.update(CATEGORICAL_FEATURE_COLS)
    excluded.update({"is_one_way", "is_peak_hour", "is_business_hours", "is_weekend"})

    numeric_cols: list[str] = []
    categorical_cols: list[str] = []
    for col in df.columns:
        if col in excluded:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            numeric_cols.append(col)
        else:
            categorical_cols.append(col)
    return numeric_cols, categorical_cols, sorted(excluded)


def _row_signature(row: pd.Series, numeric_cols: list[str], categorical_cols: list[str]) -> tuple[np.ndarray, tuple[Any, ...]]:
    numeric = np.asarray([pd.to_numeric(row.get(col, 0.0), errors="coerce") for col in numeric_cols], dtype=np.float64)
    categorical = tuple(row.get(col) for col in categorical_cols)
    return numeric, categorical


def _is_duplicate_row(
    row: pd.Series,
    seen_signatures: list[tuple[np.ndarray, tuple[Any, ...]]],
    numeric_cols: list[str],
    categorical_cols: list[str],
    mae_threshold: float,
) -> bool:
    if not seen_signatures:
        return False

    numeric, categorical = _row_signature(row, numeric_cols, categorical_cols)
    for seen_numeric, seen_categorical in seen_signatures:
        if seen_categorical != categorical:
            continue
        if len(numeric) == 0:
            return True
        mae = float(np.mean(np.abs(numeric - seen_numeric)))
        if mae <= mae_threshold:
            return True
    return False


def _is_transition_row(df_sorted: pd.DataFrame, idx: int, target_col: str) -> bool:
    if idx < 0 or idx >= len(df_sorted):
        return False
    current_label = int(df_sorted.iloc[idx][target_col])

    same_segment_prev = idx > 0 and df_sorted.iloc[idx]["segment_key"] == df_sorted.iloc[idx - 1]["segment_key"]
    same_segment_next = idx + 1 < len(df_sorted) and df_sorted.iloc[idx]["segment_key"] == df_sorted.iloc[idx + 1]["segment_key"]

    if same_segment_prev and int(df_sorted.iloc[idx - 1][target_col]) != current_label:
        return True
    if same_segment_next and int(df_sorted.iloc[idx + 1][target_col]) != current_label:
        return True
    return False


def _undersample_majority_rows(df: pd.DataFrame, config: ClassBalanceConfig) -> tuple[pd.DataFrame, dict[str, Any]]:
    df_sorted = _sort_dataframe(df)
    counts = _class_counts(df_sorted, config.target_col)
    anchor_count = counts.get(config.anchor_class, 0)
    if anchor_count <= 0:
        return df_sorted, {"applied": False, "reason": "missing_anchor_class", "before_counts": counts}

    balanced_target = int(round(config.majority_cap_multiplier * anchor_count))
    keep_probs = {cls: 1.0 for cls in range(NUM_CLASSES)}
    for cls in range(config.anchor_class):
        class_count = counts.get(cls, 0)
        if class_count > 0:
            keep_probs[cls] = min(1.0, balanced_target / float(class_count))

    numeric_cols, categorical_cols, _ = _infer_feature_columns(df_sorted)
    rng = np.random.default_rng(config.random_seed)

    seen_signatures: list[tuple[np.ndarray, tuple[Any, ...]]] = []
    kept_indices: list[int] = []
    dropped_duplicates = 0
    dropped_probability = 0

    labels = _ensure_congestion_label(df_sorted, config.target_col)
    for idx, label in enumerate(labels.to_numpy()):
        row = df_sorted.iloc[idx]

        if label >= config.anchor_class:
            kept_indices.append(idx)
            seen_signatures.append(_row_signature(row, numeric_cols, categorical_cols))
            continue

        keep_prob = float(keep_probs[label])
        duplicate_now = _is_duplicate_row(row, seen_signatures, numeric_cols, categorical_cols, config.duplicate_mae_threshold)
        if duplicate_now:
            keep_prob = min(1.0, keep_prob * config.duplicate_multiplier)
        if _is_transition_row(df_sorted, idx, config.target_col):
            keep_prob = min(1.0, keep_prob * config.transition_multiplier)

        if rng.random() < keep_prob:
            kept_indices.append(idx)
            seen_signatures.append(_row_signature(row, numeric_cols, categorical_cols))
        else:
            if duplicate_now:
                dropped_duplicates += 1
            else:
                dropped_probability += 1

    balanced_df = df_sorted.iloc[kept_indices].copy().reset_index(drop=True)
    after_counts = _class_counts(balanced_df, config.target_col)

    stats = {
        "applied": True,
        "reason": "undersampled_majority_rows",
        "before_counts": counts,
        "after_counts": after_counts,
        "keep_probabilities": keep_probs,
        "stage_counts": {"undersampled_rows": int(len(balanced_df))},
        "removed_rows": {"duplicate": int(dropped_duplicates), "probability": int(dropped_probability)},
    }
    return balanced_df, stats


def _jitter_numeric_block(
    seed_row: pd.Series,
    numeric_cols: list[str],
    rng: np.random.Generator,
    noise_pct: float,
) -> dict[str, Any]:
    row = seed_row.to_dict()
    for col in numeric_cols:
        value = row.get(col)
        if pd.isna(value):
            continue
        base = float(value)
        jitter = rng.normal(0.0, noise_pct)
        row[col] = base * (1.0 + jitter)
        if col in {"default_lane_count", "is_one_way", "is_peak_hour", "is_business_hours", "is_weekend"}:
            row[col] = int(round(max(0.0, row[col])))
    return row


def _make_synthetic_segments(
    minority_df: pd.DataFrame,
    class_label: int,
    target_rows: int,
    config: ClassBalanceConfig,
    start_segment_key: int,
    start_timestamp: pd.Timestamp,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    if minority_df.empty or target_rows <= 0:
        return minority_df.iloc[0:0].copy(), {"generated_rows": 0, "generated_segments": 0}

    numeric_cols, _, _ = _infer_feature_columns(minority_df)
    rng = np.random.default_rng(config.random_seed + class_label)

    segment_length = max(1, int(config.window_size))
    target_segments = int(math.ceil(target_rows / float(segment_length)))
    rows: list[dict[str, Any]] = []
    seed_indices = rng.integers(0, len(minority_df), size=target_segments)

    for seg_idx, seed_idx in enumerate(seed_indices):
        seed_row = minority_df.iloc[int(seed_idx)]
        synthetic_segment_key = int(start_segment_key + seg_idx)
        segment_start = start_timestamp + pd.Timedelta(minutes=seg_idx * segment_length * WINDOW_STEP_MINUTES)
        timestamps = pd.date_range(segment_start, periods=segment_length, freq=f"{WINDOW_STEP_MINUTES}min")
        temporal = create_temporal_features(timestamps)

        for step_idx, ts in enumerate(timestamps):
            row = _jitter_numeric_block(seed_row, numeric_cols, rng, config.synthetic_noise_pct)
            row["segment_key"] = synthetic_segment_key
            row["timestamp"] = ts
            row[config.target_col] = class_label
            row["synthetic_flag"] = 1
            row["source_stage"] = f"synthetic_class_{class_label}"
            row["balance_seed"] = int(config.random_seed)
            row["sanity_check_passed"] = 1

            temporal_row = temporal.iloc[step_idx]
            row["time_key"] = int(temporal_row["time_key"])
            row["time_sin"] = float(temporal_row["time_sin"])
            row["time_cos"] = float(temporal_row["time_cos"])
            row["is_peak_hour"] = int(bool(temporal_row["is_peak_hour"]))
            row["is_weekend"] = int(bool(temporal_row["is_weekend"]))
            row["is_business_hours"] = int(8 <= pd.Timestamp(ts).hour <= 17)
            row["day_of_week"] = int(temporal_row["day_of_week"])
            rows.append(row)

    synthetic_df = pd.DataFrame(rows)
    synthetic_df = synthetic_df.sort_values(by=["segment_key", "timestamp"]).reset_index(drop=True)
    return synthetic_df, {"generated_rows": int(len(synthetic_df)), "generated_segments": int(target_segments)}


def _augment_minority_classes(df: pd.DataFrame, config: ClassBalanceConfig) -> tuple[pd.DataFrame, dict[str, Any]]:
    df_sorted = _sort_dataframe(df)
    counts = _class_counts(df_sorted, config.target_col)
    anchor_count = counts.get(config.anchor_class, 0)
    if anchor_count <= 0:
        return df_sorted, {"applied": False, "reason": "missing_anchor_class", "before_counts": counts}

    minority_5 = df_sorted[df_sorted[config.target_col] == 5].copy()
    minority_4 = df_sorted[df_sorted[config.target_col] == 4].copy()
    if minority_4.empty and minority_5.empty:
        return df_sorted, {"applied": False, "reason": "missing_minority_classes", "before_counts": counts}

    start_segment_key = int(df_sorted["segment_key"].max()) + 1 if "segment_key" in df_sorted.columns and not df_sorted["segment_key"].empty else 1
    start_timestamp = pd.to_datetime(df_sorted["timestamp"].max()) + pd.Timedelta(days=1) if "timestamp" in df_sorted.columns and not df_sorted["timestamp"].empty else pd.Timestamp("2100-01-01")

    synthetic_parts: list[pd.DataFrame] = []
    stage_counts: dict[str, int] = {}

    for class_label, target_rows in ((5, config.synthetic_rows_class5), (4, config.synthetic_rows_class4)):
        minority_df = minority_5 if class_label == 5 else minority_4
        if minority_df.empty:
            continue

        synthetic_df, class_stats = _make_synthetic_segments(
            minority_df=minority_df,
            class_label=class_label,
            target_rows=int(target_rows),
            config=config,
            start_segment_key=start_segment_key,
            start_timestamp=start_timestamp,
        )
        start_segment_key += class_stats["generated_segments"]
        start_timestamp = pd.to_datetime(synthetic_df["timestamp"].max()) + pd.Timedelta(minutes=WINDOW_STEP_MINUTES) if not synthetic_df.empty else start_timestamp
        stage_counts[f"synthetic_class_{class_label}_rows"] = int(class_stats["generated_rows"])
        stage_counts[f"synthetic_class_{class_label}_segments"] = int(class_stats["generated_segments"])
        synthetic_parts.append(synthetic_df)

    if not synthetic_parts:
        return df_sorted, {"applied": False, "reason": "no_synthetic_rows_generated", "before_counts": counts}

    synthetic_df = pd.concat(synthetic_parts, ignore_index=True)
    return synthetic_df, {"applied": True, "reason": "augmented_minority_classes", "stage_counts": stage_counts}


def physics_sanity_check(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """Drop obviously impossible synthetic rows.

    Rules are conservative and only remove rows with clearly invalid values.
    """

    if df.empty:
        return df.copy(), {"removed_negative_speed": 0, "removed_negative_volume": 0, "removed_inconsistent": 0}

    working = df.copy()
    removed_negative_speed = 0
    removed_negative_volume = 0
    removed_inconsistent = 0

    speed_cols = [col for col in ("current_speed_kmh", "speed", "free_flow_speed_kmh") if col in working.columns]
    volume_cols = [col for col in ("volume", "traffic_volume") if col in working.columns]
    density_cols = [col for col in ("density", "traffic_density") if col in working.columns]

    mask = pd.Series(True, index=working.index)
    for col in speed_cols:
        bad = pd.to_numeric(working[col], errors="coerce") < 0
        removed_negative_speed += int(bad.sum())
        mask &= ~bad.fillna(False)

    for col in volume_cols:
        bad = pd.to_numeric(working[col], errors="coerce") < 0
        removed_negative_volume += int(bad.sum())
        mask &= ~bad.fillna(False)

    if volume_cols and density_cols and TARGET_COL in working.columns:
        volume_zero = sum(pd.to_numeric(working[col], errors="coerce").fillna(0) == 0 for col in volume_cols)
        density_zero = sum(pd.to_numeric(working[col], errors="coerce").fillna(0) == 0 for col in density_cols)
        inconsistent = (volume_zero >= len(volume_cols)) & (density_zero >= len(density_cols)) & (pd.to_numeric(working[TARGET_COL], errors="coerce") >= 4)
        removed_inconsistent += int(inconsistent.sum())
        mask &= ~inconsistent.fillna(False)

    filtered = working.loc[mask].copy().reset_index(drop=True)
    stats = {
        "removed_negative_speed": int(removed_negative_speed),
        "removed_negative_volume": int(removed_negative_volume),
        "removed_inconsistent": int(removed_inconsistent),
        "rows_before": int(len(working)),
        "rows_after": int(len(filtered)),
    }
    return filtered, stats


def flatten_dynamic_tensor(df: pd.DataFrame, tensor_col: str = "dynamic") -> pd.DataFrame:
    """Flatten a nested dynamic tensor column into numbered scalar columns.

    If `tensor_col` does not exist, the input is returned unchanged.
    The function accepts a list/ndarray-like column where each cell contains a
    2D tensor-like structure (e.g., shape (12, 5)).
    """

    if tensor_col not in df.columns:
        return df.copy()

    expanded_rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        tensor = row[tensor_col]
        arr = np.asarray(tensor)
        flat = arr.reshape(-1)
        flat_row = row.drop(labels=[tensor_col]).to_dict()
        for idx, value in enumerate(flat):
            flat_row[f"{tensor_col}_{idx}"] = value
        expanded_rows.append(flat_row)
    return pd.DataFrame(expanded_rows)


def reshape_dynamic_tensor(df: pd.DataFrame, tensor_col: str = "dynamic", tensor_shape: tuple[int, int] = (12, 5)) -> pd.DataFrame:
    """Inverse of `flatten_dynamic_tensor`.

    If the flattened columns are not present, the input is returned unchanged.
    """

    prefix = f"{tensor_col}_"
    flat_cols = [col for col in df.columns if col.startswith(prefix)]
    if not flat_cols:
        return df.copy()

    expected_size = tensor_shape[0] * tensor_shape[1]
    if len(flat_cols) != expected_size:
        raise ValueError(f"Cannot reshape {len(flat_cols)} columns to tensor shape {tensor_shape}")

    ordered_cols = sorted(flat_cols, key=lambda name: int(name.split("_")[-1]))
    rebuilt_rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        tensor_values = np.asarray([row[col] for col in ordered_cols], dtype=np.float32).reshape(tensor_shape)
        rebuilt = row.drop(labels=ordered_cols).to_dict()
        rebuilt[tensor_col] = tensor_values
        rebuilt_rows.append(rebuilt)
    return pd.DataFrame(rebuilt_rows)


def _write_parquet(df: pd.DataFrame, output_path: Path, engine: str = "auto") -> None:
    try:
        if engine == "auto":
            df.to_parquet(output_path, index=False)
        else:
            df.to_parquet(output_path, index=False, engine=engine)
    except Exception as exc:  # pragma: no cover - exercised in environments without parquet engines
        raise RuntimeError(
            "Parquet export failed. Install `pyarrow` or `fastparquet` to enable `to_parquet`."
        ) from exc


def build_balanced_dataset(
    df: pd.DataFrame,
    config: ClassBalanceConfig | None = None,
    output_path: str | Path | None = None,
    report_path: str | Path | None = None,
) -> tuple[pd.DataFrame, BalanceReport]:
    """Run the full class balance pipeline on a dataframe."""

    cfg = config or ClassBalanceConfig()
    working = df.copy()
    working = _sort_dataframe(working)

    stage1_df, stage1_stats = _undersample_majority_rows(working, cfg)
    if not stage1_stats.get("applied"):
        report = BalanceReport(
            applied=False,
            reason=str(stage1_stats.get("reason", "stage1_failed")),
            seed=cfg.random_seed,
            before_counts=stage1_stats.get("before_counts", {}),
            stage_counts={"stage1_rows": int(len(stage1_df))},
        )
        return stage1_df, report

    stage2_df = pd.concat(
        [
            stage1_df[stage1_df[cfg.target_col] < cfg.anchor_class],
            stage1_df[stage1_df[cfg.target_col] == cfg.anchor_class],
            stage1_df[stage1_df[cfg.target_col] > cfg.anchor_class],
        ],
        ignore_index=True,
    )

    stage3_synth_df, stage3_stats = _augment_minority_classes(stage2_df, cfg)
    combined_df = pd.concat([stage2_df, stage3_synth_df], ignore_index=True)
    combined_df = _sort_dataframe(combined_df)

    sanity_df, sanity_stats = physics_sanity_check(combined_df)
    sanity_df = sanity_df.sample(frac=1.0, random_state=cfg.random_seed).reset_index(drop=True)

    if "synthetic_flag" not in sanity_df.columns:
        sanity_df["synthetic_flag"] = 0
    if "source_stage" not in sanity_df.columns:
        sanity_df["source_stage"] = "real"
    if "sanity_check_passed" not in sanity_df.columns:
        sanity_df["sanity_check_passed"] = 1
    if "balance_seed" not in sanity_df.columns:
        sanity_df["balance_seed"] = int(cfg.random_seed)

    resolved_output = Path(output_path) if output_path else (Path(cfg.output_path) if cfg.output_path else None)
    resolved_report = Path(report_path) if report_path else (Path(cfg.report_path) if cfg.report_path else None)

    if resolved_output is not None:
        resolved_output.parent.mkdir(parents=True, exist_ok=True)
        _write_parquet(sanity_df, resolved_output, engine=cfg.parquet_engine)

    report = BalanceReport(
        applied=True,
        reason="balanced_dataset_built",
        seed=cfg.random_seed,
        before_counts=stage1_stats.get("before_counts", {}),
        after_counts=_class_counts(sanity_df, cfg.target_col),
        keep_probabilities={int(k): float(v) for k, v in stage1_stats.get("keep_probabilities", {}).items()},
        stage_counts={
            "stage1_rows": int(len(stage1_df)),
            "stage2_rows": int(len(stage2_df)),
            **{k: int(v) for k, v in stage3_stats.get("stage_counts", {}).items()},
        },
        removed_rows={
            **{k: int(v) for k, v in stage1_stats.get("removed_rows", {}).items()},
            **{f"sanity_{k}": int(v) for k, v in sanity_stats.items() if k.startswith("removed_")},
            "sanity_rows_before": int(sanity_stats.get("rows_before", len(combined_df))),
            "sanity_rows_after": int(sanity_stats.get("rows_after", len(sanity_df))),
        },
        output_path=str(resolved_output) if resolved_output else None,
        report_path=str(resolved_report) if resolved_report else None,
    )

    if resolved_report is not None:
        resolved_report.parent.mkdir(parents=True, exist_ok=True)
        resolved_report.write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    return sanity_df, report


def build_balanced_dataset_from_path(
    input_path: str | Path,
    output_path: str | Path,
    config: ClassBalanceConfig | None = None,
    report_path: str | Path | None = None,
) -> tuple[pd.DataFrame, BalanceReport]:
    """Convenience wrapper to load a CSV/Parquet and run the full pipeline."""

    path = Path(input_path)
    if not path.exists():
        raise FileNotFoundError(path)

    if path.suffix.lower() in {".parquet", ".pq"}:
        df = pd.read_parquet(path)
    elif path.suffix.lower() in {".csv"}:
        df = pd.read_csv(path)
    else:
        raise ValueError(f"Unsupported input format: {path.suffix}")

    return build_balanced_dataset(df, config=config, output_path=output_path, report_path=report_path)
