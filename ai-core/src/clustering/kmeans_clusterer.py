"""
kmeans_clusterer.py - K-Means Clustering Wrapper

Wrapper cho K-Means clustering:
- Load pre-trained model từ CLUSTERING_MODEL_PATH
- Input: Features (geometry, speeds, traffic stats)
- Output: Cluster assignments (0 to K-1)

Scikit-learn KMeans wrapper.
Mặc định: K=8 clusters.
"""

from .base_clusterer import BaseClusterer

# TODO: Triển khải KMeansClusterer
