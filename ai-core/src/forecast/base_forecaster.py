"""
base_forecaster.py - Abstract Base Class for Forecasters

Định nghĩa interface chung cho tất cả forecasting models:
- __init__: Load model, config
- predict: Input features -> Output predictions + confidence
- validate: Check input shape, data types

Subclasses:
- LSTMForecaster
- RandomForestForecaster
- EnsembleForecaster
"""

from abc import ABC, abstractmethod

# TODO: Triển khải BaseForecastModel ABC
