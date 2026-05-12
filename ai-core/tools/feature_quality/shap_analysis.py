"""Tier 3: SHAP analysis tooling.

If SHAP is unavailable, write a placeholder message and skip heavy computation.
"""
from __future__ import annotations
import os
from typing import Optional
import pandas as pd

try:
    import shap
    HAS_SHAP = True
except Exception:
    HAS_SHAP = False


def run_shap(model, X: pd.DataFrame, out_dir: str = 'ai-core/reports/feature_qc/shap', sample_size: int = 5000):
    os.makedirs(out_dir, exist_ok=True)
    if not HAS_SHAP:
        msg = os.path.join(out_dir, 'README.txt')
        with open(msg, 'w') as f:
            f.write('shap not installed; install shap to compute SHAP values')
        return msg

    if sample_size and len(X) > sample_size:
        X = X.sample(sample_size, random_state=42)

    explainer = shap.Explainer(model)
    shap_values = explainer(X)

    # summary plot
    shap.summary_plot(shap_values, X, show=False)
    out_sum = os.path.join(out_dir, 'summary.png')
    import matplotlib.pyplot as plt
    plt.savefig(out_sum)
    plt.close()

    # save raw values
    vals_path = os.path.join(out_dir, 'shap_values.parquet')
    pd.DataFrame(shap_values.values, columns=X.columns).to_parquet(vals_path)
    return out_sum
