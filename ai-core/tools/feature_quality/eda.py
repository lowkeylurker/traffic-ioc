"""Tier 1: EDA automation for feature candidates.

Produces per-feature boxplots (grouped by target), summary stats, and a CSV report with
Pearson & Spearman absolute correlations.

Behavior:
- Accepts a pandas DataFrame or a CSV path.
- If plotting libs are unavailable, still produces the CSV report and summary stats.
"""
from __future__ import annotations
import os
from typing import Optional, Sequence
import pandas as pd
import numpy as np

try:
    import matplotlib.pyplot as plt
    import seaborn as sns
    HAS_PLOT = True
except Exception:
    HAS_PLOT = False


def load_source(source: str | None = None, df: pd.DataFrame | None = None) -> pd.DataFrame:
    if df is not None:
        return df.copy()
    if source is None:
        raise ValueError("Either source or df must be provided")
    return pd.read_csv(source)


def feature_summary_by_class(df: pd.DataFrame, feature: str, target: str) -> pd.DataFrame:
    grp = df.groupby(target)[feature]
    summary = grp.agg(['count', 'median', 'mean', 'std'])
    q1 = grp.quantile(0.25)
    q3 = grp.quantile(0.75)
    summary['iqr'] = q3 - q1
    return summary


def compute_correlations(df: pd.DataFrame, features: Sequence[str], target: str) -> pd.DataFrame:
    # Pearson
    pearson = df[features + [target]].corr(method='pearson')[target].abs().loc[features]
    spearman = df[features + [target]].corr(method='spearman')[target].abs().loc[features]
    res = pd.DataFrame({'pearson_abs': pearson, 'spearman_abs': spearman})
    return res


def make_boxplot(df: pd.DataFrame, feature: str, target: str, out_path: str) -> None:
    if not HAS_PLOT:
        return
    plt.figure(figsize=(6, 4))
    try:
        sns.boxplot(x=target, y=feature, data=df)
    except Exception:
        df.boxplot(column=feature, by=target)
    plt.title(f"{feature} by {target}")
    plt.tight_layout()
    plt.savefig(out_path)
    plt.close()


def run_eda(
    source: str | None = None,
    df: pd.DataFrame | None = None,
    out_dir: str = 'ai-core/reports/feature_qc/eda',
    target: str = 'congestion_level',
    feature_candidates: Optional[Sequence[str]] = None,
) -> str:
    os.makedirs(out_dir, exist_ok=True)
    data = load_source(source, df)
    if feature_candidates is None:
        feature_candidates = [c for c in data.columns if c != target]

    corr_df = compute_correlations(data, feature_candidates, target)
    report_csv = os.path.join(out_dir, 'report.csv')
    corr_df.to_csv(report_csv)

    # Save per-feature summaries and (optionally) plots
    summaries = {}
    for feat in feature_candidates:
        summaries[feat] = feature_summary_by_class(data, feat, target).to_dict()
        if HAS_PLOT:
            try:
                plot_path = os.path.join(out_dir, f"box_{feat}.png")
                make_boxplot(data, feat, target, plot_path)
            except Exception:
                # non-fatal
                pass

    # Save summaries as a small JSON/CSV for quick inspection
    summary_csv = os.path.join(out_dir, 'feature_summaries.csv')
    rows = []
    for feat, stat in summaries.items():
        for cls, vals in stat.items():
            row = {'feature': feat, 'class': cls}
            row.update(vals)
            rows.append(row)
    pd.DataFrame(rows).to_csv(summary_csv, index=False)

    return out_dir


if __name__ == '__main__':
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument('--source', help='CSV source path', required=True)
    p.add_argument('--out', help='Output directory', default='ai-core/reports/feature_qc/eda')
    p.add_argument('--target', help='Target column', default='congestion_level')
    args = p.parse_args()
    run_eda(source=args.source, out_dir=args.out, target=args.target)
