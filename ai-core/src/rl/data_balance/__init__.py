"""RL class balancing pipeline.

This package contains the end-to-end class balancing workflow for RL training:
undersampling classes 0-2, preserving class 3, oversampling classes 4-5,
sanity-checking synthetic rows, and exporting a parquet dataset.
"""

from .pipeline import (  # noqa: F401
    ClassBalanceConfig,
    BalanceReport,
    build_balanced_dataset,
    build_balanced_dataset_from_path,
    physics_sanity_check,
    reshape_dynamic_tensor,
    flatten_dynamic_tensor,
)
