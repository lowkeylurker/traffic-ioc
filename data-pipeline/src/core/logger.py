"""Structured logging factory cho data-pipeline module."""

from __future__ import annotations

import logging
import sys
from pathlib import Path


def get_logger(name: str) -> logging.Logger:
    """Tạo logger instance với format chuẩn.

    Args:
        name: Tên logger (thường là __class__.__name__ hoặc module name).

    Returns:
        logging.Logger đã cấu hình sẵn handler.

    Format:
        [2026-02-28 14:30:00] INFO     data_pipeline.TrafficExtractor | Extracted 150 segments
    """
    logger = logging.getLogger(f"data_pipeline.{name}")

    if logger.handlers:
        return logger  # Tránh duplicate handler

    logger.setLevel(logging.DEBUG)

    # ── Console Handler (luôn bật) ────────────────────────
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(
        logging.Formatter(
            fmt="[%(asctime)s] %(levelname)-8s %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    logger.addHandler(console)

    # ── File Handler (khi LOG_DIR được set) ───────────────
    try:
        from src.core.config import settings

        if settings.log_dir:
            log_path = Path(settings.log_dir)
            log_path.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(
                log_path / "data_pipeline.log", encoding="utf-8"
            )
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(
                logging.Formatter(
                    fmt="[%(asctime)s] %(levelname)-8s %(name)s | %(message)s",
                    datefmt="%Y-%m-%d %H:%M:%S",
                )
            )
            logger.addHandler(file_handler)
    except Exception:
        pass  # Config not yet ready – console-only mode

    return logger
