"""Tier 2: Feature importance ranking pipeline.

- Trains a RandomForestClassifier (if sklearn available) using KFold CV to compute per-fold importances.
- Detects and removes multicollinear features (|correlation| > 0.7).
- Falls back to a simple univariate importance heuristic if sklearn not available.
"""
from __future__ import annotations
import os
from typing import Optional, Sequence, Tuple, List, Dict
import pandas as pd
import numpy as np

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import StratifiedKFold
    HAS_SK = True
except Exception:
    HAS_SK = False


def _detect_multicollinearity(df: pd.DataFrame, features: Sequence[str], target: str, threshold: float = 0.7) -> Tuple[List[str], List[Dict]]:
    """Detect and remove redundant features based on inter-feature correlation.
    
    Returns: (filtered_features, removed_pairs_info)
    """
    removed_pairs = []
    selected = list(features)
    
    # Compute correlation matrix between features
    feature_df = df[selected].fillna(0)
    corr_matrix = feature_df.corr().abs()
    
    # Get target correlations for decision-making
    target_corr = df[selected + [target]].corr()[target].abs().loc[selected]
    
    # Find and mark high-correlation pairs
    processed = set()
    for i, feat1 in enumerate(selected):
        for feat2 in selected[i+1:]:
            if feat1 in processed or feat2 in processed:
                continue
            corr_val = float(corr_matrix.loc[feat1, feat2])
            if corr_val > threshold:
                # Keep feature with higher target correlation
                corr1 = float(target_corr.loc[feat1])
                corr2 = float(target_corr.loc[feat2])
                if corr1 >= corr2:
                    removed_pairs.append({'removed': feat2, 'retained': feat1, 'correlation': corr_val, 'target_corr_retained': corr1, 'target_corr_removed': corr2})
                    processed.add(feat2)
                else:
                    removed_pairs.append({'removed': feat1, 'retained': feat2, 'correlation': corr_val, 'target_corr_retained': corr2, 'target_corr_removed': corr1})
                    processed.add(feat1)
    
    selected = [f for f in selected if f not in processed]
    return selected, removed_pairs


def _univariate_importance(df: pd.DataFrame, features: Sequence[str], target: str) -> pd.DataFrame:
    rows = []
    for f in features:
        # proxy: mean absolute difference of class means
        grp = df.groupby(target)[f].mean()
        if grp.isnull().any():
            score = 0.0
        else:
            score = float((grp - grp.mean()).abs().mean())
        rows.append({'feature': f, 'mean_importance': score})
    return pd.DataFrame(rows).sort_values('mean_importance', ascending=False).reset_index(drop=True)


def run_importance(
    source: str | None = None,
    df: pd.DataFrame | None = None,
    features: Optional[Sequence[str]] = None,
    target: str = 'congestion_level',
    out_dir: str = 'ai-core/reports/feature_qc/importance',
    n_splits: int = 3,
    sample_size: Optional[int] = 100000,
    multicollinearity_threshold: float = 0.7,
):
    os.makedirs(out_dir, exist_ok=True)
    if df is None:
        if source is None:
            raise ValueError('source or df required')
        df = pd.read_csv(source)

    if features is None:
        features = [c for c in df.columns if c != target]

    if sample_size is not None and len(df) > sample_size:
        df = df.sample(sample_size, random_state=42)

    # Step 1: Detect and remove multicollinear features
    features_after_mc, removed_pairs = _detect_multicollinearity(df, features, target, threshold=multicollinearity_threshold)
    if removed_pairs:
        mc_df = pd.DataFrame(removed_pairs)
        mc_csv = os.path.join(out_dir, 'multicollinearity_removed.csv')
        mc_df.to_csv(mc_csv, index=False)
        print(f'Removed {len(removed_pairs)} redundant feature pairs; see {mc_csv}')

    if not HAS_SK:
        res = _univariate_importance(df, features_after_mc, target)
        res['std'] = 0.0
        res['rank'] = res['mean_importance'].rank(method='min', ascending=False).astype(int)
        out_csv = os.path.join(out_dir, 'feature_ranking.csv')
        res.to_csv(out_csv, index=False)
        return out_csv


    X = df[list(features_after_mc)].fillna(0)
    y = df[target]

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    importances = {f: [] for f in features_after_mc}

    for train_idx, val_idx in skf.split(X, y):
        Xtr, ytr = X.iloc[train_idx], y.iloc[train_idx]
        clf = RandomForestClassifier(n_estimators=100, n_jobs=-1, random_state=42)
        clf.fit(Xtr, ytr)
        for f, imp in zip(features_after_mc, clf.feature_importances_):
            importances[f].append(float(imp))

    rows = []
    for f, vals in importances.items():
        rows.append({'feature': f, 'mean_importance': float(np.mean(vals)), 'std': float(np.std(vals))})
    res = pd.DataFrame(rows).sort_values('mean_importance', ascending=False).reset_index(drop=True)
    res['rank'] = res['mean_importance'].rank(method='min', ascending=False).astype(int)
    out_csv = os.path.join(out_dir, 'feature_ranking.csv')
    res.to_csv(out_csv, index=False)
    return out_csv


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--source', required=True)
    p.add_argument('--out', default='ai-core/reports/feature_qc/importance')
    p.add_argument('--target', default='congestion_level')
    p.add_argument('--sample', type=int, default=100000)
    args = p.parse_args()
    run_importance(source=args.source, out_dir=args.out, target=args.target, sample_size=args.sample)
