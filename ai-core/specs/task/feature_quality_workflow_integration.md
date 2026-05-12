# Spec: Tích hợp quy trình kiểm duyệt chất lượng đặc trưng (3 Tầng)

Mục tiêu: triển khai end‑to‑end workflow để tự động hoá 3 tầng kiểm duyệt đặc trưng mô tả trong `ai-core/docs/TRICH_XUAT_FEATURE.md` — bao gồm scripts, CI tasks, tests, và artefacts cho vận hành.

## Kiến trúc: Phễu lọc 3 Tầng (Funnel Architecture)

```
100% ý tưởng đặc trưng mới
    ↓ Tầng 1: EDA + Correlation (Vài giây) — Lọc bỏ 70-80% rác
    ↓
Các ứng viên hợp lệ (20-30%)
    ↓ Tầng 2: Feature Importance + Multicollinearity (Vài phút) — Loại redundant
    ↓
Top-15 đặc trưng tinh túy (cuối cùng)
    ↓ Đưa vào DQN training
    
Tầng 3: SHAP (Khi bug xảy ra) ← Chỉ dùng cho debugging, không phải selection
```

## Nguyên tắc Cốt lõi

1. **Bắt nguồn từ kiến thức ngành** (Art): Kỹ sư tạo ý tưởng đặc trưng dựa trực giác
2. **Kiểm chứng bằng phân tích** (Science): Dữ liệu quyết định, không trực giác

## Kết quả kỳ vọng

- Tier 1 script: Boxplots per feature (grouped by `congestion_level`), correlation matrix, visual quality report
- Tier 2 pipeline: Feature importance ranking + multicollinearity detection + redundancy removal
- Tier 3 module: SHAP analysis for debugging edge cases and stakeholder communication
- CLI & CI: Automated tier execution with artifact tracking
- Artifacts: `reports/feature_qc/<date>/` with PNG visualizations, CSV rankings, markdown summary

Phạm vi và Quy ước
- Input: windowed feature table used by training (`congestion_level` present if available). Use dataset sampling to bound compute for Tầng 2/3.
- Output: CSV ranking + plots + markdown summary.
- Compute: Tầng 1 cheap (single node), Tầng 2 moderate (single node, CPU/GPU optional), Tầng 3 heavy (use small sample or GPU).

Thư mục & file targets (gợi ý)
- `ai-core/tools/feature_quality/eda.py` — scripts for Tầng 1
- `ai-core/tools/feature_quality/importance.py` — Tầng 2 pipeline (XGBoost/RF wrapper)
- `ai-core/tools/feature_quality/shap_analysis.py` — Tầng 3 SHAP tooling
- `ai-core/tools/feature_quality/cli.py` — small CLI to run tasks
- `ai-core/specs/task/feature_quality_workflow_integration.md` — (this file)
- `ai-core/tests/test_feature_quality.py` — unit/integration tests
- Artifacts output: `ai-core/reports/feature_qc/`

A→Z Steps (detailed)

1) Design & quick approval
- Review `ai-core/docs/TRICH_XUAT_FEATURE.md` and agree on exact metrics and thresholds (e.g., correlation threshold, importance cutoff, SHAP sample size).
- Decide on default runtime configs: sample size for Tầng 2 (e.g., 100k windows) and Tầng 3 sample size (e.g., 5k windows).

2) Tier 1 — EDA automation (quick filter for 100% of new ideas)
- Purpose: Reject obviously useless features in seconds; not for precision ranking
- Implement `ai-core/tools/feature_quality/eda.py` to:
  - Load feature table, join with `congestion_level` (0..5 imbalanced, Level 5 rare)
  - For each candidate feature produce:
    - **Boxplot grouped by `congestion_level`** (VISUAL INSPECTION PRIMARY)
    - Summary statistics table (median, IQR, count per class)
    - Pearson & Spearman correlation with target
  - Compute correlation matrix heatmap PNG for quick reference
  - Produce a `report.csv` with columns: `feature, pearson_abs, spearman_abs, visual_quality_note`
- **Key insight**: Because Level 5 is rare (imbalanced), Pearson correlation can mislead. Trust BOXPLOT first.
  - If Level 0 and Level 5 distributions are visually identical → Drop feature immediately
  - If |pearson| << 0.1 AND boxplots overlap → Drop feature
  - If boxplots show clear separation despite low correlation → Keep for Tier 2 review
- Add a small notebook `ai-core/tools/feature_quality/eda.ipynb` for manual exploration
- CLI to run Tier 1:

```bash
python feature_quality_main.py run --tier 1 --source sample.csv --out reports/feature_qc/DATE
```

3) Tier 2 — Feature importance pipeline (team filtering & multicollinearity removal)
- Purpose: Rank features by contribution AND remove redundant/correlated pairs
- Implement `importance.py`:
  - Input: all features that passed Tier 1 (typically 20-30% of originals)
  - Step 1: **Multicollinearity detection**
    - Compute correlation matrix between ALL candidate features (not just with target)
    - Identify pairs with |correlation| > 0.7 (high redundancy)
    - For each redundant pair, keep the one with higher target correlation, drop the other
  - Step 2: **Importance ranking via StratifiedKFold CV**
    - Train RandomForest/XGBoost with K-fold CV (default 3 folds)
    - Compute per-fold feature importances
    - Aggregate: mean importance, std (stability), and rank
  - Output `feature_ranking.csv` with fields: `feature, mean_importance, std, rank, stability_note`
  - Also output `multicollinearity_removed.csv` listing dropped pairs and reason
- Example run:

```bash
python feature_quality_main.py run --tier 2 --source sample.csv --out reports/feature_qc/DATE --sample 100000
```

- **Decision rule**: Select top-15 features by mean_importance (or fewer if domain constraints). Flag std > 0.3 for manual review.

4) Tier 3 — SHAP analysis (debugging & explainability only, NOT for selection)
- **CRITICAL**: Tier 3 is expensive and meant ONLY for:
  1. **Bug diagnosis**: When DQN suddenly produces false positives (e.g., predicts Mức 5 incorrectly)
  2. **Stakeholder communication**: Explain model decisions to traffic management officials
  - NOT for daily feature selection — Tier 2 already handles that
- Implement `shap_analysis.py`:
  - Load a trained model (RF/XGBoost from Tier 2 pipeline)
  - Compute SHAP values on a small sample (default 5k windows; raise warning if forced to full dataset)
  - Save:
    - `summary_plot.png` (global feature impact heatmap)
    - `force_plot_<ID>.png` for top 5 high-error windows (if applicable)
    - `shap_values.parquet` (raw SHAP matrix for offline analysis)
  - Provide utility to generate SHAP report for a list of problematic prediction IDs
- Example (debug mode):

```bash
# Train a diagnostic model first
python -c "from tools.feature_quality.importance import run_importance; run_importance(source='sample.csv', out_dir='tmp_diag', sample_size=50000)"

# Then analyze SHAP on a small subset
python feature_quality_main.py run --tier 3 --model-path tmp_diag/model.pkl --out reports/feature_qc/shap_debug --sample 5000
```

5) CI & CLI integration
- Add `ai-core/tools/feature_quality/cli.py` exposing `run --tier <1|2|3>` with `--source`, `--out`, `--sample` arguments
- Add GitHub Actions workflow `.github/workflows/feature-quality.yml`:
  - **On PR (feature branch)**: Run Tier 1 (quick, <1 min) on diffs → Blocks merge if new features fail visual inspection
  - **Nightly**: Run Tier 2 on staging sample → Produce baseline rankings
  - **Manual trigger**: Run Tier 3 on saved model checkpoint for debugging
- Upload artifacts: CSV rankings, PNG plots → GitHub artifact storage or S3 (`feature_qc/<date>/`)

6) Tests & validation
- Add `ai-core/tests/test_feature_quality.py`:
  - Test Tier 1: EDA produces boxplots + correlations for synthetic dataset
  - Test Tier 2: Importance ranking matches expected order on synthetic data
  - Test multicollinearity removal: Verify high-correlation pairs are detected and resolved
  - All tests use synthetic data (no external dependencies)
- Run locally: `pytest tests/test_feature_quality.py -v` should pass

7) Workflow integration into feature engineering process
- New feature proposal → Run Tier 1 manually (seconds) → Decision: Keep or discard?
- 20-30 candidates pass Tier 1 → Run Tier 2 nightly → Decision: Select top-15 + identify redundant pairs
- Top-15 features → Freeze and integrate into DQN training pipeline
- Post-training: If false positive spike observed → Run Tier 3 SHAP to diagnose root cause

8) Documentation & Handoff
- README: `ai-core/tools/feature_quality/README.md` — quick commands and output descriptions
- Runbook: `ai-core/docs/FEATURE_QA_RUNBOOK.md` — comprehensive guide including:
  - When to run each tier (workflow diagram)
  - Interpretation guidelines per tier (visual vs. numeric)
  - Thresholds and decision rules
  - CI/CD integration patterns
  - Troubleshooting matrix
  - Artifact retention policy
- Owner assignment: Define who runs Tier 1 (feature author), Tier 2 (ML engineer), Tier 3 (ML lead)

Operational details & thresholds (V1, refined from doc)

**Tầng 1 Pass/Fail criteria** (goal: 20-30% survive):
- PASS: Feature shows visually distinct boxplots across Level 0 vs Level 5, OR |pearson| > 0.15 (due to imbalance, trust visuals first)
- FAIL: Level 0 and Level 5 boxplots overlap completely, AND |pearson| < 0.05
- Note: For imbalanced Level 5, correlation numbers can be misleading; always inspect EDA plots

**Tầng 2 selection criteria** (goal: 15-20 features selected):
- Remove redundant pairs: If two features have |correlation| > 0.7, keep only the one with higher target correlation
- Select top-15 by mean_importance, OR all features with rank ≤ 15 and std < 0.4
- Flag for manual review: Any feature with std > 0.3 (unstable across CV folds) — may indicate multicollinearity or overfitting signal
- Minimum requirement: At least 5 selected features must pass (if < 5 pass Tier 1, expand Tier 1 scope or revisit feature engineering)

**Tầng 3 investigation checklist** (only when needed):
- False positive spikes: Use SHAP to identify which features triggered incorrect Mức 5 prediction
- Top 5 SHAP contributors: If sum of top 5 SHAP values > 80% of decision, likely not a complex boundary issue
- Stakeholder report: Use force plot on 3-5 representative examples to explain model logic

## Commands & Examples

Tier 1 (EDA) on sample CSV:
```bash
cd ai-core
python feature_quality_main.py run --tier 1 --source /path/to/sample.csv --out reports/feature_qc/DATE
```

Tier 2 (Importance) with sampling:
```bash
python feature_quality_main.py run --tier 2 --source /path/to/sample.csv --out reports/feature_qc/DATE --sample 100000
```

Tier 3 (SHAP) for debugging:
```bash
python feature_quality_main.py run --tier 3 --model-path models/checkpoint.pkl --out reports/feature_qc/DATE --sample 5000
```

Using Make targets:
```bash
make -f Makefile.feature-quality feature-quality-tier1
make -f Makefile.feature-quality feature-quality-tier2
make -f Makefile.feature-quality feature-quality-test
```

## Acceptance Criteria (Done When)

✅ **Code Implementation**:
- All 6 modules implemented and importable (eda, importance, shap_analysis, cli, tests, init)
- CLI accepts `--tier 1|2|3`, `--source`, `--out`, `--sample` arguments
- Tier 1 outputs: boxplots PNG, correlation CSV, feature summaries CSV
- Tier 2 outputs: feature ranking CSV, multicollinearity removed CSV
- Tier 3 outputs: SHAP summary plot, raw values parquet (when model provided)

✅ **Tests**:
- All 2+ tests pass locally: `pytest tests/test_feature_quality.py -v`
- Tests cover synthetic data for Tier 1 and Tier 2

✅ **Documentation**:
- README at `tools/feature_quality/README.md` with quick start
- Runbook at `docs/FEATURE_QA_RUNBOOK.md` with workflow, thresholds, decision rules
- Makefile targets (`Makefile.feature-quality`) work end-to-end

✅ **Validation**:
- CLI runs end-to-end on a test CSV (seconds for Tier 1, minutes for Tier 2)
- Artifacts produced and readable

## Next Steps for Production

1. **Staging baseline** (1-2 days): Run Tier 1+2 on real staging data; collect baseline rankings
2. **CI integration** (1 day): Copy GA workflow; enable Tier 1 on all feature PRs
3. **Owner assignment**: Data scientist → Tier 1, ML engineer → Tier 2, ML lead → Tier 3 reviews
4. **Nightly scheduling**: Set up cron or GA scheduler for Tier 2 runs

---

Spec updated and aligned with refined methodology in `TRICH_XUAT_FEATURE.md`