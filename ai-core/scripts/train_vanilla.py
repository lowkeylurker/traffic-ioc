import os
import sys
import torch
import pandas as pd
import numpy as np
from pathlib import Path
import joblib
from torch.utils.data import DataLoader

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.ml.data.dataset import prepare_dataloaders
from src.ml.models.vanilla_lstm import VanillaLSTM
from src.ml.training.loop import train_model
from src.ml.feature_contract import DYNAMIC_FEATURE_COLS, NUM_CLASSES
from src.ml.artifacts import get_ml_checkpoint_path, get_ml_preprocessing_path

def run_vanilla_training():
    # 1. Configuration
    RUN_ID = "vanilla_baseline"
    DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    BATCH_SIZE = 512  # Faster training for vanilla
    EPOCHS = 10       # Quick baseline
    
    checkpoint_path = get_ml_checkpoint_path(run_id=RUN_ID)
    preprocessing_path = get_ml_preprocessing_path(run_id=RUN_ID)
    
    # 2. Data Loading (Reuse balanced training data)
    data_path = "/workspace/ai-core/data/processed/02_balanced_training_data.parquet"
    if not os.path.exists(data_path):
        print(f"❌ Dữ liệu training {data_path} không tồn tại. Hãy chạy Notebook 02 trước.")
        return

    print(f"📦 Loading data from: {data_path}")
    df = pd.read_parquet(data_path)
    
    # Use a subset for faster vanilla training and to avoid OOM
    # Sampling by segments to preserve time-series continuity
    if len(df) > 2000000:
        print("⚠️ Data too large for Vanilla baseline, sampling 20% of segments...")
        unique_segs = df['segment_key'].unique()
        np.random.seed(42)
        sampled_segs = np.random.choice(unique_segs, size=max(1, int(len(unique_segs) * 0.2)), replace=False)
        df = df[df['segment_key'].isin(sampled_segs)].copy()
        print(f"Sampled data: {len(df)} rows across {len(sampled_segs)} segments.")
    
    # Pre-process windows and loaders
    train_loader, val_loader, scaler, encoders = prepare_dataloaders(
        df,
        batch_size=BATCH_SIZE,
        train_ratio=0.8,
        use_weighted_sampler=True
    )
    
    train_dataset = train_loader.dataset
    val_dataset = val_loader.dataset
    artifacts = {'scaler': scaler, 'encoders': encoders}
    joblib.dump(artifacts, preprocessing_path)
    print(f"✅ Preprocessing saved to: {preprocessing_path}")

    # 3. Model Initialization
    input_dim = len(DYNAMIC_FEATURE_COLS)
    model = VanillaLSTM(input_dim=input_dim).to(DEVICE)
    
    # 4. Training
    history = train_model(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        train_dataset=train_dataset,
        epochs=EPOCHS,
        learning_rate=0.001,
        device=DEVICE,
        patience=5,
        use_class_weights=True,
        loss_type="ce",  # Keep it vanilla CrossEntropy
        checkpoint_path=str(checkpoint_path)
    )
    
    # 5. Export Predictions for Notebook 06
    print("🎬 Generating predictions for evaluation...")
    model.load_state_dict(torch.load(checkpoint_path))
    model.eval()
    
    y_true_list = []
    y_pred_list = []
    
    with torch.no_grad():
        for batch in val_loader:
            x_dyn, x_sta, x_cat, y = batch
            x_dyn = x_dyn.to(DEVICE)
            outputs = model(x_dyn)
            preds = torch.argmax(outputs, dim=1)
            y_true_list.extend(y.numpy())
            y_pred_list.extend(preds.cpu().numpy())
            
    eval_df = pd.DataFrame({
        'y_true': y_true_list,
        'y_pred': y_pred_list
    })
    
    out_path = PROJECT_ROOT / "artifacts" / "ml" / "evaluation" / "predictions_vanilla.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    eval_df.to_parquet(out_path, index=False)
    print(f"📊 Vanilla predictions exported to: {out_path}")

if __name__ == "__main__":
    run_vanilla_training()
