"""Backward-compatible proxy exporting settings from src.core.config."""

from src.core.config import BASE_DIR, Settings, settings

__all__ = ["Settings", "settings", "BASE_DIR"]
