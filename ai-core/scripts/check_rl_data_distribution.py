"""Quick data distribution check for RL training dataset."""

import os
import sys
from pathlib import Path

# Ensure we're in the right working directory
os.chdir(Path(__file__).resolve().parent.parent)
sys.path.insert(0, str(Path.cwd()))

import pandas as pd
import numpy as np
from src.utils.data_loader import load_bulk_corridor_data
from src.data_access import get_segments_in_corridor


def check_data_distribution():
    """Load RL data and analyze class distribution."""
    
    # Config from balanced profile (use just 1 corridor for speed)
    corridor_ids = [
        646713380690000556,  # Primary corridor
    ]
    start_date = "2026-03-20"
    end_date = "2026-04-08"
    peak_hours_only = True
    eval_ratio = 0.2
    
    print("=" * 70)
    print("RL DATA DISTRIBUTION CHECK")
    print("=" * 70)
    print(f"Corridors: {len(corridor_ids)}")
    print(f"Date range: {start_date} to {end_date}")
    print(f"Peak hours only: {peak_hours_only}")
    print(f"Eval ratio: {eval_ratio}")
    print()
    
    all_data = []
    for corridor_id in corridor_ids:
        print(f"Loading corridor {corridor_id}...")
        corridor_data = load_bulk_corridor_data(
            corridor_id=corridor_id,
            start_date=start_date,
            end_date=end_date,
            peak_hours_only=peak_hours_only,
        )
        if corridor_data:
            concat_data = pd.concat(corridor_data.values(), ignore_index=True)
            all_data.append(concat_data)
    
    if not all_data:
        print("❌ No data loaded!")
        return
    
    df = pd.concat(all_data, ignore_index=True)
    df = df.sort_values(by=["segment_key", "timestamp"]).reset_index(drop=True)
    
    print(f"\n📊 TOTAL DATA LOADED: {len(df)} rows")
    print()
    
    # Split by timestamp
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    split_time = df["timestamp"].quantile(1.0 - eval_ratio)
    
    train_df = df[df["timestamp"] < split_time].copy()
    eval_df = df[df["timestamp"] >= split_time].copy()
    
    print(f"Train rows: {len(train_df)}")
    print(f"Eval rows: {len(eval_df)}")
    print()
    
    # Analyze class distribution in train
    print("=" * 70)
    print("TRAIN DATA CLASS DISTRIBUTION")
    print("=" * 70)
    
    train_targets = train_df["target_label"].dropna()
    train_counts = train_targets.value_counts().sort_index()
    train_total = len(train_targets)
    
    print(f"Total samples with target_label: {train_total}")
    print()
    
    for cls in range(6):
        count = train_counts.get(cls, 0)
        pct = (count / train_total * 100) if train_total > 0 else 0
        label = f"Class {cls}"
        if cls in [3, 4, 5]:
            label += " ⚠️ (MINORITY)"
        print(f"{label:30s}: {count:10d} ({pct:6.2f}%)")
    
    print()
    minority_count = train_counts.get(3, 0) + train_counts.get(4, 0) + train_counts.get(5, 0)
    minority_pct = (minority_count / train_total * 100) if train_total > 0 else 0
    print(f"{'Total Minority (3+4+5)':30s}: {minority_count:10d} ({minority_pct:6.2f}%)")
    print()
    
    # Analyze class distribution in eval
    print("=" * 70)
    print("EVAL DATA CLASS DISTRIBUTION")
    print("=" * 70)
    
    eval_targets = eval_df["target_label"].dropna()
    eval_counts = eval_targets.value_counts().sort_index()
    eval_total = len(eval_targets)
    
    print(f"Total samples with target_label: {eval_total}")
    print()
    
    for cls in range(6):
        count = eval_counts.get(cls, 0)
        pct = (count / eval_total * 100) if eval_total > 0 else 0
        label = f"Class {cls}"
        if cls in [3, 4, 5]:
            label += " ⚠️ (MINORITY)"
        print(f"{label:30s}: {count:10d} ({pct:6.2f}%)")
    
    print()
    minority_count_eval = eval_counts.get(3, 0) + eval_counts.get(4, 0) + eval_counts.get(5, 0)
    minority_pct_eval = (minority_count_eval / eval_total * 100) if eval_total > 0 else 0
    print(f"{'Total Minority (3+4+5)':30s}: {minority_count_eval:10d} ({minority_pct_eval:6.2f}%)")
    print()
    
    # Imbalance ratio
    print("=" * 70)
    print("IMBALANCE ANALYSIS")
    print("=" * 70)
    
    majority_count = train_counts.get(0, 0) + train_counts.get(1, 0) + train_counts.get(2, 0)
    if minority_count > 0:
        imbalance_ratio = majority_count / minority_count
        print(f"Majority (0+1+2) / Minority (3+4+5): {imbalance_ratio:.2f}x")
    else:
        print("No minority samples in train data!")
    
    print()
    print("=" * 70)
    print("INTERPRETATION")
    print("=" * 70)
    if minority_pct < 5:
        print("❌ SEVERE IMBALANCE DETECTED")
        print("   Minority classes < 5% of training data.")
        print("   This explains why recall[3-5]=0 even with class-aware reward.")
        print()
        print("   Solutions:")
        print("   1. Increase RL_REWARD_SCALE to 3.0-5.0 (boost minority rewards)")
        print("   2. Use RL_REWARD_CLIP=40.0-50.0 (allow larger reward swings)")
        print("   3. Increase RL_EPISODES to 200+ (more learning rounds)")
        print("   4. Consider focal loss or other minority-boost techniques")
    elif minority_pct < 15:
        print("⚠️ MODERATE IMBALANCE DETECTED")
        print(f"   Minority classes: {minority_pct:.1f}% of training data.")
        print()
        print("   Solutions:")
        print("   1. Increase RL_REWARD_SCALE to 2.0-3.0")
        print("   2. Increase RL_EPISODES to 150+")
    else:
        print("✓ REASONABLE BALANCE")
        print(f"   Minority classes: {minority_pct:.1f}% of training data.")


if __name__ == "__main__":
    check_data_distribution()
