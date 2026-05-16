import os
import sys
import torch
import pandas as pd
import numpy as np
from pathlib import Path
import joblib
from torch.utils.data import DataLoader, Subset

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.ml.data.dataset import TrafficDataset
from src.ml.models.traffic_model import TrafficCongestionModel
from src.ml.artifacts import get_ml_checkpoint_path, get_ml_preprocessing_path
from src.ml.feature_contract import WINDOW_STEP_MINUTES
from src.utils.data_loader import load_bulk_corridor_data

def generate_sl_predictions(run_id="manual_h15", horizon=15):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # 1. Load artifacts
    checkpoint_path = get_ml_checkpoint_path(run_id=run_id)
    preprocessing_path = get_ml_preprocessing_path(run_id=run_id)
    
    print(f"Loading checkpoint: {checkpoint_path}")
    print(f"Loading preprocessing: {preprocessing_path}")
    
    artifacts = joblib.load(preprocessing_path)
    scaler = artifacts['scaler']
    encoders = artifacts['encoders']
    vocab_sizes = {col: len(enc.classes_) for col, enc in encoders.items()}

    # 2. Load data (matching evaluation split logic)
    data_path = "/workspace/ai-core/data/processed/02_balanced_training_data.parquet"
    print(f"Loading data from: {data_path}")
    df_raw = pd.read_parquet(data_path)
    
    # Use only REAL data for evaluation
    if 'synthetic_flag' in df_raw.columns:
        df_raw = df_raw[df_raw['synthetic_flag'] == 0].copy()
        print(f"Filtered real data: {len(df_raw)} rows")
    
    # --- PREPROCESSING ---
    print("Preprocessing data...")
    # Encode categorical features
    for col, enc in encoders.items():
        if col in df_raw.columns:
            # Map unknown classes to the first class or a default if necessary
            # For simplicity, we assume all classes were seen during training
            df_raw[col] = enc.transform(df_raw[col].astype(str))
            
    # Scale numerical features
    df_processed = scaler.transform(df_raw)
    
    target_offset_steps = horizon // WINDOW_STEP_MINUTES
    dataset = TrafficDataset(df_processed, window_size=12, target_offset_steps=target_offset_steps)
    
    # Chronological split (80/20)
    target_indices = [dataset._target_index(idx) for idx in dataset.valid_indices]
    window_timestamps = dataset.timestamps[target_indices]
    sorted_order = np.argsort(window_timestamps)
    split_idx = int(len(sorted_order) * 0.8)
    eval_indices = sorted_order[split_idx:]
    
    eval_subset = Subset(dataset, eval_indices)
    loader = DataLoader(eval_subset, batch_size=512, shuffle=False)

    # 3. Load model
    model = TrafficCongestionModel(vocab_sizes=vocab_sizes).to(device)
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.eval()

    # 4. Predict
    print("Generating predictions...")
    y_true = []
    y_pred = []
    
    with torch.no_grad():
        for batch in loader:
            x_dyn, x_sta, x_cat, y = batch
            x_dyn, x_sta, x_cat = x_dyn.to(device), x_sta.to(device), x_cat.to(device)
            
            outputs = model(x_dyn, x_sta, x_cat)
            preds = torch.argmax(outputs, dim=1)
            
            y_true.extend(y.cpu().numpy())
            y_pred.extend(preds.cpu().numpy())

    eval_df = pd.DataFrame({
        'y_true': y_true,
        'y_pred': y_pred
    })
    
    out_path = PROJECT_ROOT / "artifacts" / "ml" / "evaluation" / f"predictions_sl_{run_id}.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    eval_df.to_parquet(out_path, index=False)
    print(f"Predictions saved to: {out_path}")

if __name__ == "__main__":
    generate_sl_predictions()
