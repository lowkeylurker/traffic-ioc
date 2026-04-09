import torch
import torch.nn as nn

from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    NUM_CLASSES,
    STATIC_MODEL_FEATURE_COLS,
)

class TrafficCongestionModel(nn.Module):
    def __init__(
        self,
        vocab_sizes: dict,
        embedding_dim: int = 8,
        hidden_dim: int = 64,
        num_classes: int = 6,
        dropout_rate: float = 0.2,
    ):
        """
        vocab_sizes: Dictionary chứa số lượng unique values của từng biến Categorical
        embedding_dim: Số chiều của không gian vector nhúng (Mặc định: 8)
        hidden_dim: Kích thước của vector ẩn sinh ra từ LSTM (Mặc định: 64)
        num_classes: Số lượng nhãn kẹt xe đầu ra (0-5 => 6 classes)
        """
        super(TrafficCongestionModel, self).__init__()
        
        # ==========================================
        # 1. KHỐI TĨNH & NGỮ CẢNH (Context Block)
        # ==========================================
        # Tạo động các lớp Embedding dựa trên vocab_sizes truyền vào
        self.embeddings = nn.ModuleDict({
            col: nn.Embedding(num_embeddings=size, embedding_dim=embedding_dim)
            for col, size in vocab_sizes.items()
        })
        
        num_static_features = len(STATIC_MODEL_FEATURE_COLS)
        num_cat_features = len(CATEGORICAL_FEATURE_COLS)
        
        # Tổng số chiều của vector ngữ cảnh sau khi nối (Static + Các vector Embedding)
        context_dim = num_static_features + (num_cat_features * embedding_dim)
        
        # Mạng FNN nén Vector Ngữ cảnh
        self.context_fnn = nn.Sequential(
            nn.Linear(context_dim, 32),
            nn.ReLU(),
            nn.Dropout(dropout_rate)
        )
        
        # ==========================================
        # 2. KHỐI ĐỘNG LỰC HỌC (Temporal Block - LSTM)
        # ==========================================
        # Số lượng biến động = 5 (speed, pcu, index, delay, quality)
        num_dynamic_features = 5
        
        self.lstm = nn.LSTM(
            input_size=num_dynamic_features,
            hidden_size=hidden_dim,
            num_layers=2,        # Dùng 2 lớp LSTM chồng lên nhau để học sâu hơn
            batch_first=True,    # Tensor đầu vào có dạng (Batch, Seq_len, Features)
            dropout=dropout_rate
        )
        
        # ==========================================
        # 3. KHỐI HỘI TỤ (Fusion & Classifier Block)
        # ==========================================
        # Kích thước vector siêu kết hợp = LSTM Hidden (64) + Context Output (32) = 96
        fusion_dim = hidden_dim + 32
        
        self.classifier = nn.Sequential(
            nn.Linear(fusion_dim, 64),
            nn.ReLU(),
            nn.Dropout(dropout_rate),
            nn.Linear(64, num_classes) # Phóng ra 6 Logits cho 6 mức kẹt xe
        )

    def forward(self, x_dynamic, x_static, x_cat):
        # --- Xử lý Nhóm Categorical (Nhúng vector) ---
        embedded_features = []
        for i, col in enumerate(CATEGORICAL_FEATURE_COLS):
            col_data = x_cat[:, i]
            emb = self.embeddings[col](col_data)
            embedded_features.append(emb)
            
        # Nối tất cả các vector nhúng lại với nhau
        x_embedded = torch.cat(embedded_features, dim=1)
        
        # --- Xử lý Khối Ngữ cảnh ---
        # Nối vector tĩnh (x_static) với vector nhúng (x_embedded)
        x_context_full = torch.cat([x_static, x_embedded], dim=1)
        context_vector = self.context_fnn(x_context_full)
        
        # --- Xử lý Khối Động (LSTM) ---
        # lstm_out shape: (batch, seq_len, hidden_dim)
        # Bỏ qua hidden_state (h_n, c_n) trả về
        lstm_out, _ = self.lstm(x_dynamic)
        
        # Chỉ lấy Vector ẩn ở bước thời gian cuối cùng (timestep thứ 12)
        lstm_vector = lstm_out[:, -1, :] 
        
        # --- Hội tụ và Phân loại ---
        # Chập Vector Quá khứ (LSTM) và Vector Không gian (Context)
        fused_vector = torch.cat([lstm_vector, context_vector], dim=1)
        
        # Phóng ra kết quả cuối cùng (Logits)
        logits = self.classifier(fused_vector)
        
        return logits