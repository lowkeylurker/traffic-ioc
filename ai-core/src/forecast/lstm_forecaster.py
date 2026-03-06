"""
lstm_forecaster.py - LSTM Model Wrapper

Wrapper cho LSTM neural network:
- Load pre-trained weights từ FORECAST_MODEL_PATH
- Input: Time series features (shape: [batch, time_steps, features])
- Output: Predicted speeds + confidence scores

Sử dụng PyTorch hoặc TensorFlow.
"""

from .base_forecaster import BaseForecastModel

# TODO: Triển khải LSTMForecaster
