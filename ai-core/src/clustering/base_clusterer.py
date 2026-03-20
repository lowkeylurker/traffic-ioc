"""
base_clusterer.py - Abstract Base Class for Clusterers

Định nghĩa interface chung cho clustering algorithms:
- __init__: Load model, config
- predict: Features -> Cluster assignments
- get_cluster_centers: Return cluster centers
- predict_cluster: Assign segment to cluster

Subclasses:
- KMeansClusterer
- DBSCANClusterer
"""

from abc import ABC, abstractmethod

# TODO: Triển khải BaseClusterer ABC
