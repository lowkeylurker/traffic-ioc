"""
TẦNG 4: TRAFFIC FORECASTING - Speed Regression Models

Cung cấp:
- BaseForecastModel (Abstract Base Class)
- LSTM forecaster (deep learning)
- Random Forest forecaster (tree-based)
- Ensemble forecaster (combining multiple models)

Tất cả models:
- Load pre-trained weights từ file
- Nhận input features, return predictions + confidence
- Pure predict function (no training here)
"""

__all__ = [
    "BaseForecastModel",
    "LSTMForecaster",
    "RandomForestForecaster",
    "EnsembleForecaster",
]
