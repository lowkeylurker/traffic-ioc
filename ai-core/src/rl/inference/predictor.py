from datetime import time

import joblib
import numpy as np
import pandas as pd
import torch

from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    CLASS_MAPPING,
    DYNAMIC_FEATURE_COLS,
    STATIC_MODEL_FEATURE_COLS,
    WINDOW_SIZE_DEFAULT,
    WINDOW_STEP_MINUTES,
)
from src.ml.models.traffic_model import TrafficCongestionModel
from src.utils.data_loader import load_bulk_segment_data

FORECAST_WINDOW_START = time(9, 15)
FORECAST_WINDOW_END = time(21, 15)


def is_within_forecast_window(ts: pd.Timestamp) -> bool:
    local_time = pd.to_datetime(ts).time()
    return FORECAST_WINDOW_START <= local_time <= FORECAST_WINDOW_END


def is_continuous_window(df_window: pd.DataFrame, expected_steps: int = WINDOW_SIZE_DEFAULT) -> bool:
    if len(df_window) != expected_steps:
        return False
    start_time = pd.to_datetime(df_window["timestamp"]).iloc[0]
    end_time = pd.to_datetime(df_window["timestamp"]).iloc[-1]
    return (end_time - start_time) == pd.Timedelta(minutes=(expected_steps - 1) * WINDOW_STEP_MINUTES)


class RLTrafficPredictor:
    def __init__(self, model_path="best_rl_agent.pt", artifacts_path="preprocessing_artifacts.pkl", device=None):
        self.device = (
            device
            if device
            else torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
        )

        print("📥 Đang nạp Preprocessing Artifacts...")
        try:
            self.artifacts = joblib.load(artifacts_path)
            self.scaler = self.artifacts["scaler"]
            self.encoders = self.artifacts["encoders"]
            self.vocab_sizes = {col: len(enc.classes_) for col, enc in self.encoders.items()}
        except FileNotFoundError as exc:
            raise Exception(f"❌ Không tìm thấy file {artifacts_path}. Vui lòng kiểm tra lại đường dẫn.") from exc

        print(f"🧠 Đang nạp Tác tử RL từ: {model_path}...")
        self.agent_net = TrafficCongestionModel(vocab_sizes=self.vocab_sizes).to(self.device)
        try:
            self.agent_net.load_state_dict(torch.load(model_path, map_location=self.device))
            self.agent_net.eval()
        except FileNotFoundError as exc:
            raise Exception(f"❌ Không tìm thấy file {model_path}. Hãy chắc chắn bạn đã huấn luyện xong RL.") from exc

        self.level_names = CLASS_MAPPING

        self.dynamic_cols = DYNAMIC_FEATURE_COLS
        self.static_cols = STATIC_MODEL_FEATURE_COLS
        self.cat_cols = CATEGORICAL_FEATURE_COLS

    def preprocess_window(self, df_window):
        if len(df_window) != WINDOW_SIZE_DEFAULT:
            raise ValueError(f"Cần đúng {WINDOW_SIZE_DEFAULT} timesteps để inference, nhận được {len(df_window)} dòng.")

        df_processed = df_window.copy()

        for col in self.cat_cols:
            le = self.encoders[col]
            known_classes = set(le.classes_)
            df_processed[col] = df_processed[col].apply(lambda x: x if str(x) in known_classes else le.classes_[0])
            df_processed[col] = le.transform(df_processed[col].astype(str))

        scaled_df = self.scaler.transform(df_processed)

        x_dynamic = torch.FloatTensor(scaled_df[self.dynamic_cols].to_numpy(dtype=np.float32)).unsqueeze(0).to(self.device)
        x_static = torch.FloatTensor(scaled_df[self.static_cols].iloc[-1].to_numpy(dtype=np.float32)).unsqueeze(0).to(self.device)
        x_cat = torch.LongTensor(scaled_df[self.cat_cols].iloc[-1].to_numpy(dtype=np.int64)).unsqueeze(0).to(self.device)

        return x_dynamic, x_static, x_cat

    def predict(self, df_window):
        x_dynamic, x_static, x_cat = self.preprocess_window(df_window)

        with torch.no_grad():
            q_values = self.agent_net(x_dynamic, x_static, x_cat)
            best_action = torch.argmax(q_values, dim=1).item()
            q_list = q_values.squeeze().cpu().numpy()

        return {
            "predicted_level": best_action,
            "status_description": self.level_names[best_action],
            "q_values": np.round(q_list, 2),
        }

    def predict_batch(self, df_windows_list: list[pd.DataFrame]):
        B = len(df_windows_list)
        if B == 0:
            return []

        # 1. Combine all windows into one large DataFrame
        bulk_df = pd.concat(df_windows_list, ignore_index=True)

        # 2. Vectorized Preprocessing
        df_processed = bulk_df.copy()
        for col in self.cat_cols:
            le = self.encoders[col]
            known_classes = set(le.classes_)
            df_processed[col] = df_processed[col].apply(lambda x: x if str(x) in known_classes else le.classes_[0])
            df_processed[col] = le.transform(df_processed[col].astype(str))

        scaled_data = self.scaler.transform(df_processed)
        if isinstance(scaled_data, np.ndarray):
            scaled_df = pd.DataFrame(scaled_data, columns=df_processed.columns)
        else:
            scaled_df = scaled_data

        # 3. Extract and Reshape into Batch Tensors
        # Dynamic: shape (B, 12, num_dynamic)
        dyn_array = scaled_df[self.dynamic_cols].to_numpy(dtype=np.float32)
        dyn_batch = dyn_array.reshape(B, WINDOW_SIZE_DEFAULT, len(self.dynamic_cols))
        x_dynamic = torch.FloatTensor(dyn_batch).to(self.device)

        # Static & Categorical: take the last row of each window (index 11, 23, 35...)
        last_row_indices = [i * WINDOW_SIZE_DEFAULT + (WINDOW_SIZE_DEFAULT - 1) for i in range(B)]
        
        stat_array = scaled_df[self.static_cols].iloc[last_row_indices].to_numpy(dtype=np.float32)
        x_static = torch.FloatTensor(stat_array).to(self.device)

        cat_array = scaled_df[self.cat_cols].iloc[last_row_indices].to_numpy(dtype=np.int64)
        x_cat = torch.LongTensor(cat_array).to(self.device)

        # 4. Neural Network Forward Pass in Batch
        with torch.no_grad():
            q_values = self.agent_net(x_dynamic, x_static, x_cat)
            best_actions = torch.argmax(q_values, dim=1).cpu().numpy()
            q_lists = q_values.cpu().numpy()

        # 5. Format results
        results = []
        for i in range(B):
            action = best_actions[i]
            results.append({
                "predicted_level": action,
                "status_description": self.level_names[action],
                "q_values": np.round(q_lists[i], 2).tolist()
            })

        return results



def forecast_for_request(
    predictor: RLTrafficPredictor,
    segment_ids: list,
    request_time,
    lookback_steps: int = WINDOW_SIZE_DEFAULT,
    resample_minutes: int = WINDOW_STEP_MINUTES,
) -> pd.DataFrame:
    request_ts = pd.to_datetime(request_time)

    lookback_minutes = max(lookback_steps * resample_minutes + 45, 240)
    start_ts = request_ts - pd.Timedelta(minutes=lookback_minutes)

    if not segment_ids:
        raise ValueError("Danh sách segment_ids không được rỗng")

    print(f"\n🛰️ Nhận yêu cầu dự báo tại thời điểm: {request_ts}")
    print(f"📍 Danh sách segments cần dự báo: {segment_ids}")
    print(f"📡 Đang tải dữ liệu lịch sử gần nhất để dựng cửa sổ {lookback_steps} timestep...")

    segment_data = load_bulk_segment_data(
        segment_ids=segment_ids,
        start_date=start_ts.strftime("%Y-%m-%d %H:%M:%S"),
        end_date=request_ts.strftime("%Y-%m-%d %H:%M:%S"),
    )

    all_predictions = []
    skipped_not_enough = 0
    skipped_not_continuous = 0
    skipped_out_of_window = 0

    valid_windows = []
    valid_metadata = []

    for seg_key, df_segment in segment_data.items():
        if df_segment.empty:
            skipped_not_enough += 1
            continue

        df_segment = df_segment.sort_values("timestamp").reset_index(drop=True)
        df_segment["timestamp"] = pd.to_datetime(df_segment["timestamp"])

        df_hist = df_segment[df_segment["timestamp"] <= request_ts]
        if len(df_hist) < lookback_steps:
            skipped_not_enough += 1
            continue

        df_input = df_hist.tail(lookback_steps).copy()
        if not is_continuous_window(df_input, expected_steps=lookback_steps):
            skipped_not_continuous += 1
            continue

        window_end_time = df_input["timestamp"].iloc[-1]
        forecast_for_time = window_end_time + pd.Timedelta(minutes=resample_minutes)

        if not is_within_forecast_window(forecast_for_time):
            skipped_out_of_window += 1
            continue

        # Add to batch queue
        valid_windows.append(df_input)
        valid_metadata.append({
            "Segment_ID": seg_key,
            "Request_Time": request_ts,
            "Window_End_Time": window_end_time,
            "Forecast_For_Time": forecast_for_time,
        })

    # Execute True Batch Inference once for all segments
    if valid_windows:
        batch_results = predictor.predict_batch(valid_windows)
        for meta, result in zip(valid_metadata, batch_results):
            meta["Dự báo (15p tới)"] = result["status_description"]
            meta["Q-Values (Kỳ vọng)"] = str(result["q_values"])
            all_predictions.append(meta)

    print(
        "📊 Thống kê lọc segment | "
        f"Thiếu dữ liệu: {skipped_not_enough}, "
        f"Đứt chuỗi 12 bước: {skipped_not_continuous}, "
        f"Ngoài khung 09:15-21:15: {skipped_out_of_window}"
    )

    return pd.DataFrame(all_predictions)
