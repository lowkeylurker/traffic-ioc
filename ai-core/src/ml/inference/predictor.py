import logging

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F

from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    CLASS_MAPPING,
    DYNAMIC_FEATURE_COLS,
    NUM_CLASSES,
    STATIC_MODEL_FEATURE_COLS,
)
from src.ml.models.traffic_model import TrafficCongestionModel

logger = logging.getLogger(__name__)


class TrafficPredictor:
    def __init__(self, model_path: str, artifacts_path: str, device=None):
        self.device = device if device else torch.device("cuda" if torch.cuda.is_available() else "cpu")

        artifacts = joblib.load(artifacts_path)
        self.scaler = artifacts["scaler"]
        self.encoders = artifacts["encoders"]

        vocab_sizes = {col: len(enc.classes_) for col, enc in self.encoders.items()}

        self.model = TrafficCongestionModel(
            vocab_sizes=vocab_sizes,
            embedding_dim=8,
            hidden_dim=64,
            num_classes=NUM_CLASSES,
        ).to(self.device)

        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.eval()

        self.dynamic_cols = DYNAMIC_FEATURE_COLS
        self.static_cols = STATIC_MODEL_FEATURE_COLS
        self.cat_cols = CATEGORICAL_FEATURE_COLS
        self.class_mapping = CLASS_MAPPING

    def preprocess_streaming_data(self, df_recent: pd.DataFrame) -> tuple:
        df_sorted = df_recent.sort_values("timestamp").reset_index(drop=True)

        df_encoded = df_sorted.copy()
        for col in self.cat_cols:
            le = self.encoders[col]
            fallback_value = str(le.classes_[0])
            encoded_col = df_encoded[col].astype(str).copy()
            unseen_mask = ~encoded_col.isin(le.classes_)

            if unseen_mask.any():
                unseen_examples = encoded_col[unseen_mask].value_counts().head(5).to_dict()
                logger.warning(
                    "Unseen category detected for '%s': count=%d, examples=%s. Fallback='%s'.",
                    col,
                    int(unseen_mask.sum()),
                    unseen_examples,
                    fallback_value,
                )
                encoded_col.loc[unseen_mask] = fallback_value

            df_encoded[col] = le.transform(encoded_col)

        df_scaled = self.scaler.transform(df_encoded)

        x_dynamic_np = df_scaled[self.dynamic_cols].astype(np.float32).values
        x_dynamic = torch.tensor(x_dynamic_np, dtype=torch.float32).unsqueeze(0).to(self.device)

        x_static_np = df_scaled[self.static_cols].iloc[-1].astype(np.float32).values
        x_static = torch.tensor(x_static_np, dtype=torch.float32).unsqueeze(0).to(self.device)

        x_cat_np = df_scaled[self.cat_cols].iloc[-1].astype(np.int64).values
        x_cat = torch.tensor(x_cat_np, dtype=torch.long).unsqueeze(0).to(self.device)

        return x_dynamic, x_static, x_cat

    def predict_next_15_mins(self, df_recent: pd.DataFrame) -> dict:
        if len(df_recent) != 12:
            raise ValueError(
                f"Dữ liệu đầu vào cần chính xác 12 timesteps (có {len(df_recent)}). Hãy kiểm tra lại Data Loader."
            )

        x_dynamic, x_static, x_cat = self.preprocess_streaming_data(df_recent)

        with torch.no_grad():
            logits = self.model(x_dynamic, x_static, x_cat)
            probabilities = F.softmax(logits, dim=1)

            predicted_idx = torch.argmax(probabilities, dim=1).item()
            confidence = probabilities[0][predicted_idx].item() * 100

        return {
            "predicted_level": predicted_idx,
            "status_description": self.class_mapping[predicted_idx],
            "confidence_percentage": round(confidence, 2),
        }
