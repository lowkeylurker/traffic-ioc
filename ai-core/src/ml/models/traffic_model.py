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
        num_classes: int = NUM_CLASSES,
        dropout_rate: float = 0.2,
    ):
        super(TrafficCongestionModel, self).__init__()

        self.embeddings = nn.ModuleDict(
            {
                col: nn.Embedding(num_embeddings=size, embedding_dim=embedding_dim)
                for col, size in vocab_sizes.items()
            }
        )

        num_static_features = len(STATIC_MODEL_FEATURE_COLS)
        num_cat_features = len(CATEGORICAL_FEATURE_COLS)
        context_dim = num_static_features + (num_cat_features * embedding_dim)

        self.context_fnn = nn.Sequential(
            nn.Linear(context_dim, 32),
            nn.ReLU(),
            nn.Dropout(dropout_rate),
        )

        num_dynamic_features = 5
        self.lstm = nn.LSTM(
            input_size=num_dynamic_features,
            hidden_size=hidden_dim,
            num_layers=2,
            batch_first=True,
            dropout=dropout_rate,
        )

        fusion_dim = hidden_dim + 32
        self.classifier = nn.Sequential(
            nn.Linear(fusion_dim, 64),
            nn.ReLU(),
            nn.Dropout(dropout_rate),
            nn.Linear(64, num_classes),
        )

    def forward(self, x_dynamic, x_static, x_cat):
        embedded_features = []
        for i, col in enumerate(CATEGORICAL_FEATURE_COLS):
            col_data = x_cat[:, i]
            emb = self.embeddings[col](col_data)
            embedded_features.append(emb)

        x_embedded = torch.cat(embedded_features, dim=1)
        x_context_full = torch.cat([x_static, x_embedded], dim=1)
        context_vector = self.context_fnn(x_context_full)

        lstm_out, _ = self.lstm(x_dynamic)
        lstm_vector = lstm_out[:, -1, :]

        fused_vector = torch.cat([lstm_vector, context_vector], dim=1)
        logits = self.classifier(fused_vector)
        return logits
