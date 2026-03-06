"""
TẦNG 6: CLUSTERING & DATA IMPUTATION

Cung cấp:
- BaseClusterer (ABC)
- KMeansClusterer
- DBSCANClusterer
- FeatureExtractor (tính features cho clustering)
- SimilarityMatcher (tìm similar segments)
- Imputation (fill missing data)

Dùng để impute dữ liệu khi sensor bị lỗi hoặc null.
"""

__all__ = [
    "BaseClusterer",
    "KMeansClusterer",
    "DBSCANClusterer",
    "FeatureExtractor",
    "SimilarityMatcher",
    "Imputation",
]
