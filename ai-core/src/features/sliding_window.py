"""
sliding_window.py - Time Series Windowing

Tạo sliding windows từ time series data để dùng cho LSTM training.

Ví dụ:
- Input: speeds = [20, 21, 22, 23, 24, 25, 26, 27, 28]
- window_size = 3, forecast_horizon = 1
- Output: X = [[20,21,22], [21,22,23], ...], y = [23, 24, ...]

Pure function, fully testable.
"""

# TODO: Triển khải tạo sliding window
