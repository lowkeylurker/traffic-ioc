import pandas as pd
import numpy as np
import torch
from torch.utils.data import Dataset
from torch.utils.data import DataLoader
from sklearn.preprocessing import MinMaxScaler
from datetime import timedelta
from sklearn.preprocessing import LabelEncoder 

class TrafficDataset(Dataset):
    def __init__(self, df: pd.DataFrame, window_size: int = 12):
        """
        df: DataFrame gốc đã được GlobalScaler chuẩn hóa về 0-1
        window_size: Số lượng timesteps quá khứ (12 = 3 tiếng)
        """
        self.df = df
        self.window_size = window_size
        
        # Chuyển đổi các cột dữ liệu sang Numpy Arrays để truy xuất siêu tốc
        self.timestamps = pd.to_datetime(self.df['timestamp']).values
        self.segment_keys = self.df['segment_key'].values
        
        # Tách riêng 3 nhóm dữ liệu
        # 1. Nhóm Động (LSTM Input) - Ép về float32 để nhẹ RAM và model học nhanh hơn
        self.dynamic_features = self.df[['current_speed_kmh', 'pcu_volume', 
                                         'traffic_index', 'delay_seconds', 'quality_flag']].astype(np.float32).values
                                         
        # 2. Nhóm Tĩnh (FNN Input) - Ép về float32
        self.static_features = self.df[['default_lane_count', 'static_free_flow', 
                                        'time_sin', 'time_cos', 'weather_severity']].astype(np.float32).values
                                        
        # Các biến Categorical - BẮT BUỘC ép về int64 (vì nn.Embedding chỉ nhận số nguyên)
        self.cat_features = self.df[['osm_highway_type', 'district', 'day_of_week', 'shift_code']].astype(np.int64).values
        
        # 3. Nhãn Mục Tiêu (Target) - BẮT BUỘC ép về int64 để dùng cho hàm Loss đa lớp
        self.targets = self.df['target_label'].astype(np.int64).values
        
        # --- THUẬT TOÁN TÌM CỬA SỔ HỢP LỆ ---
        self.valid_indices = []
        expected_delta = np.timedelta64(window_size * 15, 'm') # 180 phút
        
        # Quét từ đầu đến dòng (cuối - window_size)
        total_rows = len(self.df)
        for i in range(total_rows - self.window_size):
            target_idx = i + self.window_size
            
            # Điều kiện 1: Cùng Segment
            same_segment = (self.segment_keys[i] == self.segment_keys[target_idx])
            
            # Điều kiện 2: Thời gian liên tục (Không nhảy qua đêm)
            time_diff = self.timestamps[target_idx] - self.timestamps[i]
            continuous_time = (time_diff == expected_delta)
            
            if same_segment and continuous_time:
                self.valid_indices.append(i)
                
        print(f"Tổng số dòng dữ liệu thô: {total_rows}")
        print(f"Tổng số cửa sổ 12-timesteps hợp lệ thu được: {len(self.valid_indices)}")

    def __len__(self):
        # Hệ thống chỉ train trên số lượng cửa sổ hợp lệ
        return len(self.valid_indices)

    def __getitem__(self, idx):
        # PyTorch sẽ truyền vào idx từ 0 đến len(valid_indices)
        start_idx = self.valid_indices[idx]
        target_idx = start_idx + self.window_size
        
        # Trích xuất Dynamic Input (12 timesteps)
        x_dynamic = self.dynamic_features[start_idx : target_idx]
        
        # Trích xuất Static & Categorical Input (Chỉ lấy tại timestep dự báo hoặc timestep đầu tiên)
        # Các biến tĩnh không đổi nên lấy ở vị trí start_idx là đủ
        x_static = self.static_features[start_idx]
        x_cat = self.cat_features[start_idx]
        
        # Trích xuất Target Label (Tại timestep t+12)
        y_target = self.targets[target_idx]
        
        # Trả về các khối Tensor
        return (
            torch.tensor(x_dynamic, dtype=torch.float32),
            torch.tensor(x_static, dtype=torch.float32),
            torch.tensor(x_cat, dtype=torch.long), # Categorical dùng long cho Embedding
            torch.tensor(y_target, dtype=torch.long) # CrossEntropyLoss yêu cầu label dạng long
        )

class TrafficScaler:
    def __init__(self):
        # Chỉ scale các biến số thực (Continuous)
        self.dynamic_scaler = MinMaxScaler()
        self.static_scaler = MinMaxScaler()
        
        self.dynamic_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 'delay_seconds', 'quality_flag']
        self.static_cols = ['default_lane_count', 'static_free_flow', 'weather_severity']
        
    def fit(self, df_train: pd.DataFrame):
        """Chỉ fit trên tập Train"""
        self.dynamic_scaler.fit(df_train[self.dynamic_cols])
        self.static_scaler.fit(df_train[self.static_cols])
        return self
        
    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Biến đổi trên mọi tập (Train/Val/Test)"""
        df_scaled = df.copy()
        df_scaled[self.dynamic_cols] = self.dynamic_scaler.transform(df[self.dynamic_cols])
        df_scaled[self.static_cols] = self.static_scaler.transform(df[self.static_cols])
        return df_scaled

def prepare_dataloaders(df: pd.DataFrame, train_ratio=0.8, batch_size=64, window_size=12):
    """
    Hàm tổng hợp: Mã hóa -> Chia tập -> Scale -> Đóng gói DataLoader
    """
    # 0. MÃ HÓA CÁC BIẾN CHỮ THÀNH SỐ (LABEL ENCODING)
    # Bổ sung day_of_week vào đây luôn phòng trường hợp nó đang ở dạng chữ ('Monday', 'Tuesday'...)
    cat_cols = ['osm_highway_type', 'district', 'shift_code', 'day_of_week']
    df_encoded = df.copy()
    label_encoders = {} 
    
    for col in cat_cols:
        le = LabelEncoder()
        # Dòng này sẽ biến 'tertiary' -> 0, 'primary' -> 1...
        df_encoded[col] = le.fit_transform(df_encoded[col].astype(str))
        label_encoders[col] = le 
    
    # 1. CHIA TẬP THEO THỜI GIAN (Sử dụng df_encoded đã được mã hóa)
    split_idx = int(len(df_encoded) * train_ratio)
    df_train = df_encoded.iloc[:split_idx].copy()
    df_val = df_encoded.iloc[split_idx:].copy()
    
    # 2. KHỞI TẠO VÀ FIT SCALER (Chỉ học từ tập Train)
    scaler = TrafficScaler()
    scaler.fit(df_train) 
    
    # 3. TRANSFORM DỮ LIỆU SỐ THỰC
    df_train_scaled = scaler.transform(df_train)
    df_val_scaled = scaler.transform(df_val)
    
    # 4. TẠO PYTORCH DATASET
    train_dataset = TrafficDataset(df_train_scaled, window_size=window_size)
    val_dataset = TrafficDataset(df_val_scaled, window_size=window_size)
    
    # 5. TẠO DATALOADER
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    return train_loader, val_loader, scaler, label_encoders

if __name__ == "__main__":
    from src.utils.data_loader import load_bulk_corridor_data
    from src.ml.traffic_model import TrafficCongestionModel

    print("--- BẮT ĐẦU TEST DATASET & DATALOADER ---")
    # Lấy thử 1 corridor nhỏ trong khoảng thời gian ngắn để test nhanh
    corridor_data = load_bulk_corridor_data(corridor_id=646713380690000556, start_date='2026-03-20', end_date='2026-03-25')
    
    if corridor_data:
        # Gộp tất cả segments lại thành 1 DataFrame duy nhất
        df_test = pd.concat(corridor_data.values(), ignore_index=True)
        
        # BẮT BUỘC: Sort lại theo segment_key và timestamp để thuật toán Cửa sổ hợp lệ hoạt động đúng
        df_test = df_test.sort_values(by=['segment_key', 'timestamp']).reset_index(drop=True)
        
        print(f"\n=> Kích thước DataFrame test: {df_test.shape}")
        
        # Chạy hàm prepare_dataloaders (Nhớ để batch_size nhỏ để dễ nhìn)
        train_loader, val_loader, scaler, encoders = prepare_dataloaders(df_test, train_ratio=0.8, batch_size=32, window_size=12)
        
        print(f"\nSố lượng batch trong Train Loader: {len(train_loader)}")
        print(f"Số lượng batch trong Val Loader: {len(val_loader)}")
        
        # RÚT THỬ 1 BATCH ĐẦU TIÊN ĐỂ KIỂM TRA
        for batch in train_loader:
            x_dynamic, x_static, x_cat, y_target = batch
            
            print("\n--- KIỂM TRA KÍCH THƯỚC (SHAPE) CỦA TENSOR ---")
            print(f"1. Luồng Động (Dynamic) : {x_dynamic.shape} \t(Kỳ vọng: 32, 12, 5)")
            print(f"2. Luồng Tĩnh (Static)  : {x_static.shape} \t\t(Kỳ vọng: 32, 5)")
            print(f"3. Luồng Chữ (Categorical): {x_cat.shape} \t\t(Kỳ vọng: 32, 4)")
            print(f"4. Nhãn Mục Tiêu (Target) : {y_target.shape} \t\t(Kỳ vọng: 32)")
            
            print("\n--- KIỂM TRA KIỂU DỮ LIỆU (DTYPE) ---")
            print(f"x_dynamic dtype: {x_dynamic.dtype} \t(Kỳ vọng: torch.float32)")
            print(f"x_cat dtype    : {x_cat.dtype} \t(Kỳ vọng: torch.int64)")
            print(f"y_target dtype : {y_target.dtype} \t(Kỳ vọng: torch.int64)")
            
            print("\n--- KIỂM TRA SCALER VÀ ENCODER ---")
            print(f"Mẫu x_dynamic (Dòng 1, Timestep 1): \n{x_dynamic[0][0]}")
            print(f"Mẫu x_cat (Dòng 1 - Đã mã hóa số): \n{x_cat[0]}")
            print(f"Mẫu Target (Congestion Level): \n{y_target[:5]}")
            
          
            print("\n--- KÍCH THƯỚC TỪ ĐIỂN (VOCAB SIZES) CHO EMBEDDING ---")
            vocab_sizes = {}
            for col, encoder in encoders.items():
                # len(encoder.classes_) chính là số lượng giá trị unique
                vocab_sizes[col] = len(encoder.classes_)
                print(f"Cột {col}: {vocab_sizes[col]} unique values")
                
            # --- KIỂM TRA MÔ HÌNH MẠNG NƠ-RON (SANITY CHECK) ---
            print("\n--- KHỞI TẠO VÀ TEST FORWARD PASS MÔ HÌNH ---")
            # 1. Khởi tạo mô hình với vocab_sizes vừa tìm được
            
            model = TrafficCongestionModel(
                vocab_sizes=vocab_sizes, 
                embedding_dim=8, 
                hidden_dim=64, 
                num_classes=6
            )
            
            print("Khởi tạo mô hình thành công!")
            
            # 2. Đưa dữ liệu qua mô hình (Forward Pass)
            # PyTorch tự động gọi hàm forward() khi ta truyền dữ liệu vào model()
            logits = model(x_dynamic, x_static, x_cat)
            
            print(f"Kích thước đầu ra của Mô hình (Logits shape): {logits.shape} \t(Kỳ vọng: 32, 6)")
            print(f"Mẫu Logits đầu ra (Dòng 1): \n{logits[0].detach().numpy()}")
            print("=> MÔ HÌNH ĐÃ SẴN SÀNG 100% CHO VIỆC HUẤN LUYỆN!")
            
            break # Kết thúc vòng lặp test batch