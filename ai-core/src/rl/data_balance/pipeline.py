print(">>> LOADING PIPELINE VERSION 5.4 - TYPE ENFORCEMENT FIXED <<<")

import os
import sys
import numpy as np
import pandas as pd
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Tuple, Union

# Project constants
NUM_CLASSES = 6
TARGET_COL = "congestion_level"

@dataclass
class ClassBalanceConfig:
    def __init__(
        self,
        anchor_class: int = 3,
        majority_multipliers: Optional[Dict[int, float]] = None,
        majority_cap: Optional[int] = 100000,
        synthetic_rows_class4: int = 0,
        synthetic_rows_class5: int = 0,
        window_size: int = 12,
        target_col: str = "congestion_level",
        use_ctgan: bool = True,
        parquet_engine: str = "fastparquet",
        random_seed: int = 42,
        output_path: Optional[str] = None,
        report_path: Optional[str] = None,
    ):
        self.anchor_class = anchor_class
        self.majority_multipliers = majority_multipliers or {0: 1.5, 1: 2.5, 2: 1.5}
        self.majority_cap = majority_cap
        self.synthetic_rows_class4 = synthetic_rows_class4
        self.synthetic_rows_class5 = synthetic_rows_class5
        self.window_size = window_size
        self.target_col = target_col
        self.use_ctgan = use_ctgan
        self.parquet_engine = parquet_engine
        self.random_seed = random_seed
        self.output_path = output_path
        self.report_path = report_path

@dataclass
class BalanceReport:
    applied: bool
    reason: str
    seed: int
    before_counts: Dict[int, int] = field(default_factory=dict)
    after_counts: Dict[int, int] = field(default_factory=dict)
    stage_counts: Dict[str, int] = field(default_factory=dict)
    output_path: Optional[str] = None
    report_path: Optional[str] = None
    def to_dict(self): return asdict(self)

def _extract_window_indices(df: pd.DataFrame, window_size: int, target_col: str) -> Tuple[pd.DataFrame, np.ndarray]:
    if df.empty or len(df) < window_size: return df, np.array([])
    df_clean = df.copy()
    df_clean['timestamp'] = pd.to_datetime(df_clean['timestamp'])
    df_clean = df_clean.drop_duplicates(subset=['segment_key', 'timestamp']).sort_values(['segment_key', 'timestamp']).reset_index(drop=True)
    W = window_size - 1
    from src.ml.feature_contract import WINDOW_STEP_MINUTES
    expected_gap = W * WINDOW_STEP_MINUTES 
    df_clean['gap'] = df_clean.groupby('segment_key')['timestamp'].diff(periods=W).dt.total_seconds() / 60
    df_clean['key_match'] = (df_clean['segment_key'] == df_clean['segment_key'].shift(W))
    valid_mask = (df_clean['key_match']) & (np.abs(df_clean['gap'] - expected_gap) < 1.0)
    valid_indices = np.where(valid_mask)[0]
    return df_clean, valid_indices

def _undersample_majority_rows(df: pd.DataFrame, config: ClassBalanceConfig) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    VERSION 7.0: Smart-Filtering Undersampling.
    Prioritizes informative windows for classes 0, 1, 2 using entropy and transitions.
    """
    window_size = config.window_size + 1
    W = window_size - 1
    df_clean, valid_indices = _extract_window_indices(df, window_size, config.target_col)
    all_labels = df_clean[config.target_col].astype(int).values
    
    class_indices = {i: [] for i in range(6)}
    for idx in valid_indices:
        label = all_labels[idx]
        if 0 <= label <= 5: class_indices[label].append(idx)
        
    anchor_count = len(class_indices[config.anchor_class])
    print(f"⚓ Stage 2 Smart-Filtering: Analyzing {len(valid_indices)} windows...")
    
    selected_parts = []
    new_key = 9000000000000000
    final_counts = {}
    
    for label in range(4): 
        indices = class_indices[label]
        if not indices: continue
        
        target = len(indices) if label == config.anchor_class else min(int(anchor_count * config.majority_multipliers.get(label, 1.0)), config.majority_cap or 1000000)
        
        if len(indices) > target:
            # HYBRID SAMPLING: 50% Smart (Entropy) + 50% Random
            print(f"🧠 Hybrid-Filtering Class {label}: {len(indices)} -> {target}")
            
            num_smart = target // 2
            num_random = target - num_smart
            
            # 1. Smart Part (Entropy-based)
            scores = []
            for idx in indices:
                win_speeds = df_clean.iloc[idx - W : idx + 1]['current_speed_kmh'].values
                speed_std = np.std(win_speeds)
                scores.append(speed_std + 0.1)
            
            scores = np.array(scores)
            probs = scores / scores.sum()
            
            smart_indices = np.random.choice(indices, num_smart, replace=False, p=probs)
            
            # 2. Random Part (Diversity)
            remaining_indices = list(set(indices) - set(smart_indices))
            random_indices = np.random.choice(remaining_indices, num_random, replace=False)
            
            sampled_indices = np.concatenate([smart_indices, random_indices])
        else:
            sampled_indices = indices
            
        # TỐI ƯU VECTƠ HÓA: Không dùng vòng lặp tạo DF nhỏ
        final_counts[label] = len(sampled_indices)
        if len(sampled_indices) > 0:
            # Tạo danh sách chỉ mục cho toàn bộ các cửa sổ cùng lúc
            all_window_indices = []
            for start_idx in sampled_indices:
                all_window_indices.extend(range(start_idx - W, start_idx + 1))
            
            # Lấy toàn bộ dữ liệu một lần duy nhất
            label_df = df_clean.iloc[all_window_indices].copy()
            
            # Cập nhật segment_key mới (mỗi cửa sổ 1 key)
            new_keys = np.arange(new_key, new_key + len(sampled_indices))
            label_df['segment_key'] = np.repeat(new_keys, window_size)
            
            # Ép kiểu để tiết kiệm RAM
            for col in label_df.select_dtypes(include=['float64']).columns:
                label_df[col] = label_df[col].astype('float32')
            
            selected_parts.append(label_df)
            new_key += len(sampled_indices)
            
            import gc
            gc.collect()
            
    if not selected_parts: return pd.DataFrame(), {"applied": False}
    return pd.concat(selected_parts, ignore_index=True), {"applied": True, "window_counts": final_counts}

def _augment_minority_classes(df: pd.DataFrame, config: ClassBalanceConfig) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    window_size = config.window_size + 1
    W = window_size - 1
    df_clean, valid_indices = _extract_window_indices(df, window_size, config.target_col)
    all_labels = df_clean[config.target_col].astype(int).values
    class_window_ends = {i: [] for i in range(6)}
    for idx in valid_indices:
        label = all_labels[idx]
        if 0 <= label <= 5: class_window_ends[label].append(idx)
    synthetic_parts = []
    current_new_key = 8000000000000000
    from src.ml.feature_contract import WINDOW_STEP_MINUTES
    from src.features.temporal_features import create_temporal_features
    CORE_FEATURES = ["current_speed_kmh", "traffic_index", "delay_seconds", "free_flow_speed_kmh", "time_sin", "time_cos", "day_of_week"]
    for label in [5, 4]:
        target = getattr(config, f"synthetic_rows_class{label}", 0)
        if target <= 0: continue
        ends = class_window_ends[label]
        seeds = [df_clean.iloc[idx - W : idx + 1].copy() for idx in ends]
        if not seeds: continue
        print(f"🧬 CTGAN Augmenting Class {label}: {len(seeds)} seeds -> {target} windows")
        try:
            from sdv.single_table import CTGANSynthesizer
            from sdv.metadata import SingleTableMetadata
            # Prepare flat data for CTGAN with STRICT column filtering
            flat_frames = []
            for s in seeds:
                # ONLY keep core features to avoid stray string columns causing errors
                f = s[CORE_FEATURES].copy()
                f['row_offset'] = np.arange(len(s))
                
                # Enforce strict types for CTGAN compatibility
                for col in CORE_FEATURES:
                    if any(x in col for x in ["speed", "index", "delay", "sin", "cos", "gap"]):
                        f[col] = pd.to_numeric(f[col], errors='coerce').fillna(0).astype(float)
                    else:
                        f[col] = f[col].astype(str)
                flat_frames.append(f)
            
            flat_df = pd.concat(flat_frames, ignore_index=True)
            
            metadata = SingleTableMetadata()
            metadata.detect_from_dataframe(flat_df)
            
            # Explicitly set SDV column types
            for col in CORE_FEATURES:
                if any(x in col for x in ["speed", "index", "delay", "sin", "cos", "gap"]):
                    metadata.update_column(column_name=col, sdtype='numerical')
                else:
                    metadata.update_column(column_name=col, sdtype='categorical')
            
            # Special case for the row_offset
            if 'row_offset' in flat_df.columns:
                metadata.update_column(column_name='row_offset', sdtype='numerical')
            
            syn = CTGANSynthesizer(metadata, epochs=50, verbose=False)
            syn.fit(flat_df)
            new_flat = syn.sample(num_rows=target * window_size)
            
            # POISON-PROOF: Only use the time range of REAL data (avoiding 2086/2108 dates)
            real_timestamps = pd.to_datetime(df_clean[df_clean['timestamp'].dt.year <= 2026]['timestamp'])
            if real_timestamps.empty:
                min_ts = pd.to_datetime("2026-03-25")
                max_ts = pd.to_datetime("2026-04-26")
            else:
                min_ts = real_timestamps.min()
                max_ts = real_timestamps.max()
            
            time_span_seconds = (max_ts - min_ts).total_seconds()
            
            # TỐI ƯU HÓA: Thu thập dữ liệu vào list và tạo DF một lần duy nhất
            rows_to_collect = []
            for i in range(target):
                random_offset = np.random.randint(0, max(1, int(time_span_seconds - 13*15*60)))
                start_ts = min_ts + pd.Timedelta(seconds=random_offset)
                win_ts = [start_ts + pd.Timedelta(minutes=j*15) for j in range(window_size)]
                
                start_row = i * window_size
                win_data = new_flat.iloc[start_row : start_row + window_size].copy()
                
                for j in range(len(win_data)):
                    r = win_data.iloc[j].to_dict()
                    r.update({"timestamp": win_ts[j], "segment_key": current_new_key, config.target_col: label, "synthetic_flag": 1})
                    
                    # Chuyển kiểu ngay lập tức để tiết kiệm RAM
                    for c in ["weather_key", "day_of_week", "shift_code", "is_peak_hour", "is_business_hours", "is_weekend"]:
                        if c in r: r[c] = np.int64(float(r[c]))
                    rows_to_collect.append(r)
                current_new_key += 1
            
            synthetic_parts.append(pd.DataFrame(rows_to_collect))
            del rows_to_collect # Giải phóng bộ nhớ tạm
            import gc
            gc.collect()
        except Exception as e:
            print(f"⚠️ CTGAN failed, using jitter: {e}")
            for i in range(target):
                seed = seeds[i % len(seeds)].copy()
                seed['segment_key'] = current_new_key
                seed['synthetic_flag'] = 1
                synthetic_parts.append(seed)
                current_new_key += 1
    if not synthetic_parts: return pd.DataFrame(), {"applied": False}
    return pd.concat(synthetic_parts, ignore_index=True), {"applied": True}

def physics_sanity_check(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    if df.empty: return df, {}
    working = df.copy()
    mask = pd.Series(True, index=working.index)
    for col in ["current_speed_kmh", "speed", "volume", "traffic_volume"]:
        if col in working.columns:
            mask &= (pd.to_numeric(working[col], errors="coerce").fillna(0) >= 0)
    filtered = working.loc[mask].copy().reset_index(drop=True)
    return filtered, {"removed": len(working) - len(filtered)}

def build_balanced_dataset(df: pd.DataFrame, config: ClassBalanceConfig, output_path=None, report_path=None) -> Tuple[pd.DataFrame, BalanceReport]:
    raw_df = df.copy()
    synthetic_df, over_stats = _augment_minority_classes(raw_df, config)
    undersampled_real_df, under_stats = _undersample_majority_rows(raw_df, config)
    combined_df = pd.concat([undersampled_real_df, synthetic_df], ignore_index=True)
    
    # CRITICAL TYPE ENFORCEMENT
    # Known categorical columns that fastparquet hates if they are mixed/floats
    INT_COLS = ["day_of_week", "shift_code", "weather_key", "tomtom_frc", "quality_flag", 
                "is_peak_hour", "is_business_hours", "is_weekend", "synthetic_flag", config.target_col]
    for col in INT_COLS:
        if col in combined_df.columns:
            combined_df[col] = pd.to_numeric(combined_df[col], errors="coerce").fillna(0).astype(np.int64)
            
    clean_df, sanity_stats = physics_sanity_check(combined_df)
    final_counts = {}
    if not clean_df.empty:
        summary = clean_df.groupby("segment_key")[config.target_col].last()
        final_counts = {int(k): int(v) for k, v in summary.value_counts().items()}
    report = BalanceReport(applied=True, reason="success", seed=config.random_seed, after_counts=final_counts, output_path=str(output_path) if output_path else None)
    
    # Switch to pyarrow if possible for better stability
    engine = config.parquet_engine
    try:
        import pyarrow
        engine = "pyarrow"
    except ImportError: pass
    
    if output_path: clean_df.to_parquet(output_path, engine=engine)
    if report_path:
        import json
        with open(report_path, 'w') as f: json.dump(report.to_dict(), f)
    return clean_df, report

def build_balanced_dataset_from_path(input_path, config, **kwargs):
    df = pd.read_parquet(input_path)
    return build_balanced_dataset(df, config, **kwargs)

def reshape_dynamic_tensor(df: pd.DataFrame, tensor_col: str = "dynamic") -> pd.DataFrame: return df
def flatten_dynamic_tensor(df: pd.DataFrame, tensor_col: str = "dynamic") -> pd.DataFrame: return df
