"""
imputation.py - Data Imputation Strategy

Fill missing speed data dựa trên clustering:

Methods:
1. KNN Imputation:
   - Tìm K neighbors gần nhất
   - Lấy trung bình tốc độ của neighbors
   - Return imputed_speed + confidence

2. Cluster Mean:
   - Fill bằng trung bình của toàn cluster
   - Đơn giản, mất chi tiết

3. Weighted Average:
   - Trọng số dựa trên similarity distance
   - Segment gần nhất -> trọng số cao hơn

Pure function.
"""

# TODO: Triển khải các chiến lược imputation
