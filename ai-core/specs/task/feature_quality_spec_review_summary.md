# Spec Review & Update Summary

Date: 2026-04-28
Status: ✅ Spec updated and aligned with refined methodology

## Changes Made to Align with Updated `TRICH_XUAT_FEATURE.md`

### 1. **Added Funnel Architecture Diagram**
- Added visual representation showing:
  - 100% new ideas → Tier 1 → 20-30% candidates → Tier 2 → Top-15 features → DQN
  - Tier 3 SHAP only for debugging

### 2. **Tier 1 — Key Updates**
- **Emphasized**: Visual inspection > correlation numbers for imbalanced data
- **Key insight**: Level 5 is rare, so Pearson correlation can mislead — trust boxplots first
- **Decision rule refined**: 
  - PASS: Visually distinct Level 0 vs Level 5 boxplots OR |pearson| > 0.15
  - FAIL: Overlapping boxplots AND |pearson| < 0.05
- **Clarified**: Runs on 100% of new feature ideas (first funnel stage)

### 3. **Tier 2 — Major Enhancement: Multicollinearity Detection**
- **Added**: Step 1 before importance ranking = multicollinearity detection
- **Implementation**: 
  - Compute inter-feature correlation matrix (not just with target)
  - Identify redundant pairs with |correlation| > 0.7
  - For each pair, keep feature with higher target correlation
  - Output `multicollinearity_removed.csv` listing dropped pairs
- **Code updated**: `importance.py` now includes `_detect_multicollinearity()` function
- **Decision rule**: Select top-15 features by importance (after removing redundant pairs)
- **Flag for review**: Features with std > 0.3 (unstable across CV folds)

### 4. **Tier 3 — Clarified Purpose (Debugging Only, Not Selection)**
- **Critical note**: Tier 3 is expensive and meant ONLY for:
  1. Bug diagnosis (false positive spikes)
  2. Stakeholder communication (explaining model decisions)
- **NOT for**: Daily feature selection (Tier 2 already handles that)

### 5. **Operational Thresholds — Specific Targets**
- **Tier 1 funnel**: Goal 20-30% survive (100% candidates → 20-30% pass)
- **Tier 2 selection**: Goal 15-20 features selected (min 5 required)
- **Tier 3 SHAP**: Top 5 contributors interpretation (>80% of decision = simple boundary)

### 6. **Workflow Integration**
- **New section**: Workflow integration into feature engineering process
- New feature proposal → Tier 1 → 20-30 candidates → Tier 2 → Top-15 → DQN training
- Post-training: False positive spike → Tier 3 SHAP for diagnosis

### 7. **Commands & Examples Updated**
- Changed from incorrect `python -m ai_core.tools...` to correct `python feature_quality_main.py run --tier ...`
- Updated all example commands to use actual entry point

### 8. **Acceptance Criteria Refined**
- Code, tests, docs, validation all explicitly listed
- Clear "done when" checkpoints for production readiness

## Code Implementation Updates

### `importance.py` Enhanced
- Added `_detect_multicollinearity()` function with:
  - Correlation matrix computation
  - Redundant pair detection (threshold 0.7)
  - Target correlation comparison for decision
  - Output CSV with removed pairs and reasons
- Modified `run_importance()` to:
  - Call multicollinearity detection first
  - Filter features before importance ranking
  - Output `multicollinearity_removed.csv`

### Validation
- ✅ Tests still pass (2/2 PASSED)
- ✅ Multicollinearity detection verified on test data (0.995 correlated speed/speed_v2)
- ✅ Correctly removed redundant feature and kept higher target-correlation feature

## Files Updated

| File | Changes |
|------|---------|
| `specs/task/feature_quality_workflow_integration.md` | Funnel architecture, refined Tier 1/2/3 guidance, multicollinearity details, thresholds |
| `tools/feature_quality/importance.py` | Added multicollinearity detection + removal logic |

## Next Steps

1. **Staging validation**: Run full workflow on real staging data (1-2 days)
2. **CI integration**: Enable Tier 1 checks on all feature PRs (1 day)
3. **Owner assignment**: Data scientist → T1, ML eng → T2, ML lead → T3 reviews
4. **Nightly scheduling**: Set up cron for Tier 2 baseline runs

---

Spec is now fully aligned with refined 3-tier methodology described in updated `TRICH_XUAT_FEATURE.md`.
Implementation ready for production staging validation.