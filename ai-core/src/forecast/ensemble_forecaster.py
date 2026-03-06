"""
ensemble_forecaster.py - Ensemble Model Combiner

Kết hợp dự báo từ LSTM + Random Forest:
- Gọi cả hai models
- Trung bình kết quả hoặc weighted average
- Return ensemble prediction + confidence

Nâng cao độ ổn định của dự báo.
"""

from .base_forecaster import BaseForecastModel

# TODO: Triển khải EnsembleForecaster
