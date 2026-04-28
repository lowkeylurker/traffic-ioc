# Feature Quality Assessment Runbook

## Overview

This runbook describes the 3-tier feature QA workflow for traffic prediction models:

- **Tier 1**: EDA (fast, exploratory) — boxplots, correlation matrix, summaries
- **Tier 2**: Feature importance ranking (moderate, diagnostic) — RandomForest/XGBoost CV
- **Tier 3**: SHAP analysis (expensive, forensic) — model debugging and explainability

## When to Run

| Tier | When | Owner | Frequency | Compute |
|------|------|-------|-----------|---------|
| Tier 1 | Every feature PR; before Tier 2 | Data scientist | On-demand, PR checks | Seconds |
| Tier 2 | After Tier 1 approval; nightly; before model deploy | ML engineer | Nightly, or before release | Minutes |
| Tier 3 | Model failure investigation; audit reports | ML lead | On-demand | ~10–30 min |

## Quick Start

### Setup

```bash
cd ai-core
pip install -r requirements.txt  # ensure pandas, scikit-learn, matplotlib, shap (optional)
```

### Tier 1 — EDA (5 seconds)

Run on a CSV sample:

```bash
python feature_quality_main.py run --tier 1 --source data/sample.csv --out reports/feature_qc/tier1
```

Output:
- `reports/feature_qc/tier1/report.csv` — Pearson/Spearman correlations
- `reports/feature_qc/tier1/feature_summaries.csv` — per-class statistics
- `reports/feature_qc/tier1/box_<feature>.png` — boxplots (if matplotlib available)

**Interpretation**:
- High |correlation| → feature likely predictive
- Overlapping boxplots across classes → weak discriminator
- Sparse/NaN counts → data quality issue

### Tier 2 — Importance (2–5 minutes)

Train ensemble models and rank features:

```bash
python feature_quality_main.py run --tier 2 --source data/sample.csv --out reports/feature_qc/tier2 --sample 100000
```

Output:
- `reports/feature_qc/tier2/feature_ranking.csv`:
  - `feature` — name
  - `mean_importance` — average across CV folds
  - `std` — stability (lower = more stable)
  - `rank` — ordinal rank

**Interpretation**:
- Top 10 by mean_importance → keep for training
- std < 0.1 → stable contributor
- std > 0.3 → unstable; may be correlated/redundant

### Tier 3 — SHAP (10–30 minutes on GPU, or use small sample)

Compute SHAP values for a trained model:

```bash
# First, train a temporary importance model as reference
python -c "
from tools.feature_quality import importance
importance.run_importance(source='data/sample.csv', out_dir='tmp', sample_size=50000)
# Then, from tmp/feature_ranking.csv, load top-K features for SHAP analysis
"
```

For a custom model checkpoint:

```python
from tools.feature_quality.shap_analysis import run_shap
import pickle
with open('models/my_model.pkl', 'rb') as f:
    model = pickle.load(f)
run_shap(model, X_sample, out_dir='reports/feature_qc/tier3', sample_size=5000)
```

Output:
- `reports/feature_qc/tier3/summary.png` — global SHAP summary plot
- `reports/feature_qc/tier3/shap_values.parquet` — raw SHAP values

**Interpretation**:
- Tall bars in summary plot → high mean |SHAP| impact
- Color gradient → feature value correlation with impact
- Use force plots to debug high-error predictions

## Integration into CI/CD

### GitHub Actions (suggested)

Add to `.github/workflows/feature-quality.yml`:

```yaml
name: Feature Quality Check

on:
  pull_request:
    paths:
      - 'ai-core/src/ml/feature_contract.py'
      - 'ai-core/src/features/**'
      - 'ai-core/src/utils/segment_processing.py'

jobs:
  tier1-eda:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.9'
      - run: |
          cd ai-core
          pip install -r requirements-dev.txt
          python tests/test_feature_quality.py -v
      - run: |
          cd ai-core
          python feature_quality_main.py run --tier 1 --source ../data/ci_sample.csv --out reports/feature_qc/pr
      - uses: actions/upload-artifact@v3
        with:
          name: tier1-eda
          path: ai-core/reports/feature_qc/pr/
```

### Local Make target

Add to `ai-core/Makefile`:

```makefile
.PHONY: feature-quality-tier1 feature-quality-tier2 feature-quality-tier3

feature-quality-tier1:
	python feature_quality_main.py run --tier 1 --source data/sample.csv --out reports/feature_qc/$$(date +%F)

feature-quality-tier2:
	python feature_quality_main.py run --tier 2 --source data/sample.csv --out reports/feature_qc/$$(date +%F) --sample 100000

feature-quality-tier3:
	@echo "Tier 3 requires a model; see runbook"
```

Usage:

```bash
make feature-quality-tier1
make feature-quality-tier2
```

## Thresholds & Decision Rules (V1)

### Tier 1 criteria (pass/fail)

- **PASS**: at least 5 features with |Pearson| > 0.1 and visually distinct boxplots.
- **FAIL**: fewer features; or high NaN rate (>30%).

### Tier 2 criteria (keep/review)

- **Keep**: top-K features by mean_importance, where K = min(15, 0.5 * num_features).
- **Review**: std > 0.3 or rank jump > 2x between consecutive features.
- **Drop**: rank > top-K AND not strongly justified by domain.

### Tier 3 criteria (investigate)

- Use SHAP to debug if:
  - Model accuracy drops > 5% after adding feature.
  - SHAP summary shows feature with near-zero impact but high variance.
  - False positive rate spikes on a specific segment/time window.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `pandas not found` | Missing requirement | `pip install pandas` |
| `sklearn not found` | Tier 2 will fall back to univariate | Install `scikit-learn` for RF/XGBoost |
| `matplotlib not found` | Plots skipped | Install `matplotlib` to enable plots |
| `shap not found` | Tier 3 disabled | Install `shap` for explainability |
| Correlation = NaN | Feature has zero variance | Check data quality |
| Importance = 0 for all | Model not converging | Check feature scaling/preprocessing |

## Artifacts & Retention

- **Tier 1 reports**: commit to repo under `reports/feature_qc/baselines/` for historical comparison.
- **Tier 2 rankings**: keep latest in `reports/feature_qc/latest_ranking.csv`.
- **Tier 3 SHAP plots**: archive to S3 or local storage for 30 days; link in incident reports.

## Owners & Escalation

- **Data pipeline**: Ensure warehouse and mart include all candidate features.
- **ML engineering**: Run Tier 2; validate importance ranking before training.
- **ML lead**: Review Tier 3 on-demand; sign off on feature drops/renames.
- **DevOps**: Maintain CI jobs and artifact storage.

## Example: Complete Feature Evaluation

1. You propose a new feature `congestion_ratio = speed / speed_limit`.
2. Add to [feature_contract.py](../src/ml/feature_contract.py).
3. Run Tier 1 EDA on a sample: `make feature-quality-tier1`.
4. Review `report.csv`: if `|pearson| > 0.1` and boxplot distinct → proceed.
5. Run Tier 2: `make feature-quality-tier2`.
6. If `rank <= 10` and `std < 0.3` → OK to merge.
7. After 1 week in production, check if false positives increase. If yes, run Tier 3 SHAP to diagnose.

## References

- Feature contract: [src/ml/feature_contract.py](../src/ml/feature_contract.py)
- Feature extraction: [src/utils/segment_processing.py](../src/utils/segment_processing.py)
- EDA script: [tools/feature_quality/eda.py](../tools/feature_quality/eda.py)
- Importance script: [tools/feature_quality/importance.py](../tools/feature_quality/importance.py)
- SHAP helper: [tools/feature_quality/shap_analysis.py](../tools/feature_quality/shap_analysis.py)
