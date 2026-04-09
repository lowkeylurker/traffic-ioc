import logging

import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import LabelEncoder
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

from src.features.sliding_window import find_valid_window_starts
from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    DYNAMIC_FEATURE_COLS,
    STATIC_MODEL_FEATURE_COLS,
    TARGET_COL,
    WINDOW_SIZE_DEFAULT,
)
from src.utils.preprocessing import TrafficScaler

logger = logging.getLogger(__name__)


class TrafficDataset(Dataset):
    def __init__(self, df: pd.DataFrame, window_size: int = 12):
        self.df = df
        self.window_size = window_size
        self.dynamic_cols = DYNAMIC_FEATURE_COLS
        self.static_cols = STATIC_MODEL_FEATURE_COLS
        self.cat_cols = CATEGORICAL_FEATURE_COLS

        self.timestamps = pd.to_datetime(self.df["timestamp"]).values
        self.segment_keys = self.df["segment_key"].values

        self.dynamic_features = self.df[self.dynamic_cols].astype(np.float32).values
        self.static_features = self.df[self.static_cols].astype(np.float32).values
        self.cat_features = self.df[self.cat_cols].astype(np.int64).values
        self.targets = self.df[TARGET_COL].clip(0, 5).astype(np.int64).values

        self.valid_indices = find_valid_window_starts(
            timestamps=self.timestamps,
            segment_keys=self.segment_keys,
            window_size=self.window_size,
            step_minutes=15,
        )

        print(f"Tổng số dòng dữ liệu thô: {len(self.df)}")
        print(f"Tổng số cửa sổ 12-timesteps hợp lệ thu được: {len(self.valid_indices)}")

    def get_training_targets(self) -> np.ndarray:
        target_indices = [start_idx + self.window_size for start_idx in self.valid_indices]
        return self.targets[target_indices]

    def __len__(self):
        return len(self.valid_indices)

    def __getitem__(self, idx):
        start_idx = self.valid_indices[idx]
        target_idx = start_idx + self.window_size

        x_dynamic = self.dynamic_features[start_idx:target_idx]
        x_static = self.static_features[target_idx - 1]
        x_cat = self.cat_features[target_idx - 1]
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
    use_weighted_sampler: bool = True,
):
    df_working = df.copy()
    df_working["timestamp"] = pd.to_datetime(df_working["timestamp"])

    split_time = df_working["timestamp"].quantile(train_ratio)
    df_train = df_working[df_working["timestamp"] < split_time].copy()
    df_val = df_working[df_working["timestamp"] >= split_time].copy()

    label_encoders = {}
    for col in CATEGORICAL_FEATURE_COLS:
        le = LabelEncoder()
        train_col = df_train[col].astype(str)
        le.fit(train_col)
        label_encoders[col] = le

        df_train[col] = le.transform(train_col)

        val_col = df_val[col].astype(str)
        unseen_mask = ~val_col.isin(le.classes_)
        if unseen_mask.any():
            fallback_value = str(le.classes_[0])
            unseen_examples = val_col[unseen_mask].value_counts().head(5).to_dict()
            logger.warning(
                "Validation contains unseen category for '%s': count=%d, examples=%s. Fallback='%s'.",
                col,
                int(unseen_mask.sum()),
                unseen_examples,
                fallback_value,
            )
            val_col.loc[unseen_mask] = fallback_value
        df_val[col] = le.transform(val_col)

    scaler = TrafficScaler()
    scaler.fit(df_train)

    df_train_scaled = scaler.transform(df_train)
    df_val_scaled = scaler.transform(df_val)

    train_dataset = TrafficDataset(df_train_scaled, window_size=window_size)
    val_dataset = TrafficDataset(df_val_scaled, window_size=window_size)

    train_sampler = None
    if use_weighted_sampler:
        train_targets = train_dataset.get_training_targets()
        class_counts = np.bincount(train_targets, minlength=6)
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
