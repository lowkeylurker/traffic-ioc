import logging

import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import LabelEncoder
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler, Subset

from src.features.sliding_window import find_valid_window_starts
from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    DYNAMIC_FEATURE_COLS,
    STATIC_MODEL_FEATURE_COLS,
    TARGET_COL,
    NUM_CLASSES,
    WINDOW_SIZE_DEFAULT,
    WINDOW_STEP_MINUTES,
)
from src.utils.preprocessing import TrafficScaler

logger = logging.getLogger(__name__)


class TrafficDataset(Dataset):
    def __init__(self, df: pd.DataFrame, window_size: int = WINDOW_SIZE_DEFAULT, target_offset_steps: int = 1, verbose: bool = True):
        self.df = df
        self.window_size = window_size
        self.target_offset_steps = target_offset_steps
        self.dynamic_cols = DYNAMIC_FEATURE_COLS
        self.static_cols = STATIC_MODEL_FEATURE_COLS
        self.cat_cols = CATEGORICAL_FEATURE_COLS

        if self.target_offset_steps <= 0:
            raise ValueError("target_offset_steps phải >= 1")

        self.timestamps = pd.to_datetime(self.df["timestamp"]).values
        self.segment_keys = self.df["segment_key"].values

        self.dynamic_features = self.df[self.dynamic_cols].astype(np.float32).values
        self.static_features = self.df[self.static_cols].astype(np.float32).values
        self.cat_features = self.df[self.cat_cols].astype(np.int64).values
        self.targets = self.df[TARGET_COL].clip(0, NUM_CLASSES - 1).astype(np.int64).values

        continuity_window_size = self.window_size + self.target_offset_steps - 1
        self.valid_indices = find_valid_window_starts(
            timestamps=self.timestamps,
            segment_keys=self.segment_keys,
            window_size=continuity_window_size,
            step_minutes=WINDOW_STEP_MINUTES,
        )

        if verbose:
            print(f"Tổng số dòng dữ liệu thô: {len(self.df)}")
            print(
                "Tổng số cửa sổ hợp lệ thu được: "
                f"{len(self.valid_indices)} (window={self.window_size}, target_offset={self.target_offset_steps})"
            )
            
            # Log class distribution of windows
            if len(self.valid_indices) > 0:
                window_targets = self.get_training_targets()
                unique, counts = np.unique(window_targets, return_counts=True)
                dist = dict(zip(unique, counts))
                print("Phân bổ Class trong các cửa sổ:")
                for cls in range(NUM_CLASSES):
                    print(f"  - Class {cls}: {dist.get(cls, 0)} windows")

    def _target_index(self, start_idx: int) -> int:
        return start_idx + self.window_size + self.target_offset_steps - 1

    def get_training_targets(self) -> np.ndarray:
        target_indices = [self._target_index(start_idx) for start_idx in self.valid_indices]
        return self.targets[target_indices]

    def __len__(self):
        return len(self.valid_indices)

    def __getitem__(self, idx):
        start_idx = self.valid_indices[idx]
        target_idx = self._target_index(start_idx)
        input_end_idx = start_idx + self.window_size

        x_dynamic = self.dynamic_features[start_idx:input_end_idx]
        x_static = self.static_features[input_end_idx - 1]
        x_cat = self.cat_features[input_end_idx - 1]
        y_target = self.targets[target_idx]

        return (
            torch.tensor(x_dynamic, dtype=torch.float32),
            torch.tensor(x_static, dtype=torch.float32),
            torch.tensor(x_cat, dtype=torch.long),
            torch.tensor(y_target, dtype=torch.long),
        )


def prepare_dataloaders(
    df: pd.DataFrame,
    train_ratio=0.8,
    batch_size=64,
    window_size=WINDOW_SIZE_DEFAULT,
    target_offset_steps: int = 1,
    use_weighted_sampler: bool = True,
):
    df_working = df.copy()
    
    # 1. Encode categorical columns on the WHOLE dataset to ensure consistent mapping
    label_encoders = {}
    for col in CATEGORICAL_FEATURE_COLS:
        if col in df_working.columns:
            le = LabelEncoder()
            # Ensure consistent type (string) for encoding
            df_working[col] = df_working[col].astype(str)
            df_working[col] = le.fit_transform(df_working[col])
            label_encoders[col] = le

    # 3. Create a temporary master dataset to find all valid windows and their timestamps
    # This helps us find the chronological split point
    full_dataset_raw = TrafficDataset(
        df_working,
        window_size=window_size,
        target_offset_steps=target_offset_steps,
        verbose=False # Don't print distribution yet
    )
    
    if len(full_dataset_raw) == 0:
        raise ValueError("Không tìm thấy cửa sổ hợp lệ nào trong dữ liệu đầu vào.")

    # 4. Chronological Split Point
    target_indices = [full_dataset_raw._target_index(idx) for idx in full_dataset_raw.valid_indices]
    window_timestamps = full_dataset_raw.timestamps[target_indices]
    sorted_order = np.argsort(window_timestamps)
    
    split_idx = int(len(sorted_order) * train_ratio)
    train_win_indices = sorted_order[:split_idx]
    val_win_indices = sorted_order[split_idx:]
    
    # Identify the split timestamp to partition the RAW dataframe for scaling
    # This ensures the scaler only sees training data distribution
    split_ts = window_timestamps[sorted_order[split_idx-1]]
    train_df_raw = df_working[pd.to_datetime(df_working['timestamp']) <= pd.to_datetime(split_ts)]
    
    # 5. Fit Scaler ONLY on training rows, then transform full df
    scaler = TrafficScaler()
    scaler.fit(train_df_raw)
    df_scaled = scaler.transform(df_working)
    
    # 6. Create the final scaled datasets
    full_dataset_scaled = TrafficDataset(
        df_scaled,
        window_size=window_size,
        target_offset_steps=target_offset_steps,
        verbose=True # Final distribution print
    )
    
    train_dataset = Subset(full_dataset_scaled, train_win_indices)
    val_dataset = Subset(full_dataset_scaled, val_win_indices)
    
    print(f"Dataset split complete (LEAK-PROOF CHRONOLOGICAL): Train={len(train_dataset)}, Val={len(val_dataset)}")

    # Log detailed window distribution
    print("\n📊 PHÂN BỔ CỬA SỔ CHI TIẾT (TRAIN VS VAL):")
    all_targets = full_dataset_scaled.get_training_targets()
    train_targets = all_targets[train_win_indices]
    val_targets = all_targets[val_win_indices]
    
    train_counts = np.bincount(train_targets, minlength=NUM_CLASSES)
    val_counts = np.bincount(val_targets, minlength=NUM_CLASSES)
    
    for cls in range(NUM_CLASSES):
        print(f"  - Class {cls}: Train={train_counts[cls]:>6} | Val={val_counts[cls]:>6}")
    print("-" * 50)

    train_sampler = None
    if use_weighted_sampler:
        # Correctly get targets for the training subset
        all_targets = full_dataset_scaled.get_training_targets()
        train_targets = all_targets[train_win_indices]
        
        class_counts = np.bincount(train_targets, minlength=NUM_CLASSES)
        sample_weights = np.array(
            [1.0 / class_counts[target] if class_counts[target] > 0 else 0.0 for target in train_targets],
            dtype=np.float64,
        )
        train_sampler = WeightedRandomSampler(
            weights=torch.as_tensor(sample_weights, dtype=torch.double),
            num_samples=len(sample_weights),
            replacement=True,
        )

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        sampler=train_sampler,
        shuffle=(train_sampler is None),
        drop_last=True,
    )
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    return train_loader, val_loader, scaler, label_encoders
