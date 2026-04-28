# Feature Quality Assessment Tools

3-tier workflow for evaluating feature candidates: Tier 1 (EDA), Tier 2 (importance ranking), Tier 3 (SHAP explainability).

## Quick Start

### Using Make (recommended)

```bash
# Run all tests
make -f Makefile.feature-quality feature-quality-test

# Run Tier 1 EDA on a sample CSV
make -f Makefile.feature-quality feature-quality-tier1

# Run Tier 2 importance ranking on a sample CSV
make -f Makefile.feature-quality feature-quality-tier2

# Try a demo (uses synthetic data)
make -f Makefile.feature-quality feature-quality-demo
```

### Quick Test (Try This First!)

Generate synthetic data and run Tier 1 immediately:

```bash
cd ai-core

# Generate test data (one-liner)
python -c "
import pandas as pd, numpy as np
np.random.seed(42)
n = 1000
df = pd.DataFrame({
    'speed': np.random.normal(30, 5, n),
    'flow': np.random.poisson(20, n),
    'occupancy': np.random.uniform(0, 100, n),
    'congestion_level': np.random.randint(0, 6, n)
})
df.to_csv('test_data.csv', index=False)
print('✓ Created test_data.csv')
"

# Run Tier 1 on test data
python feature_quality_main.py run --tier 1 --source test_data.csv --out reports/feature_qc/quick_test

# View results
ls -lh reports/feature_qc/quick_test/eda/
```

### Using CLI directly

⚠️ **Replace placeholders with actual paths:**

```bash
cd ai-core

# Tier 1 (EDA) - fast
# Replace: SAMPLE_CSV_PATH with your actual CSV file path
python feature_quality_main.py run --tier 1 --source SAMPLE_CSV_PATH --out reports/feature_qc/$(date +%F)

# Example with real path:
python feature_quality_main.py run --tier 1 --source data/staging_sample.csv --out reports/feature_qc/$(date +%F)

# Tier 2 (importance) - moderate, with optional sampling
# Replace: SAMPLE_CSV_PATH with your actual CSV file path
python feature_quality_main.py run --tier 2 --source SAMPLE_CSV_PATH --out reports/feature_qc/$(date +%F) --sample 100000

# Example with real path:
python feature_quality_main.py run --tier 2 --source data/staging_sample.csv --out reports/feature_qc/$(date +%F) --sample 100000

# Tier 3 (SHAP) - requires a model checkpoint or python callable
# Replace: MODEL_PATH with your actual model checkpoint path
python feature_quality_main.py run --tier 3 --model-path MODEL_PATH --out reports/feature_qc/$(date +%F) --sample 5000

# Example with real path:
python feature_quality_main.py run --tier 3 --model-path reports/feature_qc/models/xgb_checkpoint.pkl --out reports/feature_qc/$(date +%F) --sample 5000
```

### Input Data Format

Your CSV must include:
- A `congestion_level` column (0-5 target values)
- Feature columns (numeric or categorical)
- No required name format for features

Example:
```
speed,flow,occupancy,congestion_level
25.5,18,45.2,1
30.1,22,62.0,2
15.3,35,88.1,4
```

## Outputs

| Tier | Output Files | Interpretation |
|------|--------------|-----------------|
| Tier 1 | `report.csv`, `feature_summaries.csv`, `box_*.png` | Correlation (Pearson & Spearman) + boxplots per feature |
| Tier 2 | `feature_ranking.csv` | Feature importance ranking with mean, std, rank |
| Tier 2 | `multicollinearity_removed.csv` | (Optional) List of redundant features removed |
| Tier 3 | `summary.png`, `shap_values.parquet` | Global SHAP impact heatmap + raw SHAP values |

## Full Documentation

See `docs/FEATURE_QA_RUNBOOK.md` for:
- Detailed interpretation guidelines
- When to run each tier
- Thresholds and decision rules
- CI/CD integration patterns
- Troubleshooting matrix

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| `FileNotFoundError: /path/to/sample.csv` | Replace `/path/to/sample.csv` with actual file path (e.g., `data/sample.csv`) |
| `KeyError: 'congestion_level'` | CSV must include a `congestion_level` column (target) |
| `No such file or directory: reports/feature_qc/...` | Directory auto-created; ensure parent `reports/` exists |
| `ModuleNotFoundError: pandas` | Run `pip install -r requirements.txt` first |
| Empty or very small boxplots | Feature has no variance; check data quality |
