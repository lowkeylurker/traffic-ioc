import torch
import torch.nn as nn
from src.ml.feature_contract import NUM_CLASSES

class VanillaLSTM(nn.Module):
    """
    Mô hình LSTM thuần túy (Vanilla).
    Chỉ sử dụng đặc trưng chuỗi thời gian (Dynamic), bỏ qua Context (Static, Categorical).
    Dùng để làm Baseline so sánh mức độ đóng góp của Feature Engineering.
    """
    def __init__(
        self,
        input_dim: int,
        hidden_dim: int = 64,
        num_layers: int = 2,
        num_classes: int = NUM_CLASSES,
        dropout_rate: float = 0.2,
    ):
        super(VanillaLSTM, self).__init__()
        
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout_rate if num_layers > 1 else 0
        )
        
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Dropout(dropout_rate),
            nn.Linear(64, num_classes)
        )

    def forward(self, x_dynamic, x_static=None, x_cat=None):
        # Vanilla LSTM chỉ quan tâm đến dữ liệu chuỗi thời gian
        lstm_out, _ = self.lstm(x_dynamic)
        
        # Lấy trạng thái ẩn cuối cùng của chuỗi (Sequence-to-Label)
        last_hidden = lstm_out[:, -1, :]
        
        logits = self.classifier(last_hidden)
        return logits
