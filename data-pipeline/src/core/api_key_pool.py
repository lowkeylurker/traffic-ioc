"""TomTom API Key Pool.

Thread-safe round-robin key rotation across multiple TomTom API keys.

Features:
  - Per-key daily usage tracking with midnight auto-reset
  - Smart selection: always picks the key with most remaining budget
  - Graceful 403-blocking: key blocked per day if Forbidden is returned
  - Auto-compute cycle budget from pool size (no manual config needed)
  - Module-level singleton (lazy init from settings)

Usage:
    from src.core.api_key_pool import get_key_pool

    pool = get_key_pool()
    key  = pool.get_next_key()        # pick key with most remaining budget
    pool.record_success(key)          # increment daily usage counter
    pool.mark_blocked(key)            # exclude key for rest of day (403)
"""

from __future__ import annotations

import atexit
import json
import os
import threading
from datetime import date
from pathlib import Path
from typing import Optional

from src.core.logger import get_logger

# Default schedule: 06:00-21:00 every 15 minutes (inclusive 21:00) = 61 cycles/day.
_CYCLES_PER_ACTIVE_DAY: int = max(1, int(os.getenv("ETL_ACTIVE_CYCLES_PER_DAY", "61")))

logger = get_logger(__name__)


class TomTomKeyPool:
    """Thread-safe pool of TomTom API keys with daily usage tracking."""

    def __init__(self, keys: list[str], daily_limit_per_key: int = 2500) -> None:
        if not keys:
            raise ValueError("TomTomKeyPool requires at least one API key")
        self._keys: list[str] = [k.strip() for k in keys if k.strip()]
        self._daily_limit: int = daily_limit_per_key
        self._usage: dict[str, int] = {k: 0 for k in self._keys}
        self._blocked: set[str] = set()          # 403-blocked keys, cleared next day
        self._current_date: date = date.today()
        self._lock = threading.Lock()
        self._state_file = Path(
            os.getenv("TOMTOM_KEY_POOL_STATE_FILE", "/app/cache/tomtom_key_pool_state.json")
        )
        self._load_state()
        atexit.register(self._save_state)
        logger.info(
            "TomTomKeyPool ready: %d keys × %d req/day = %d total/day (~%d req/cycle)",
            len(self._keys),
            self._daily_limit,
            self.total_daily_capacity,
            self.budget_per_cycle,
        )

    def _save_state(self) -> None:
        """Persist current pool state to disk for cross-process continuity."""
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "date": self._current_date.isoformat(),
                "usage": self._usage,
                "blocked": sorted(self._blocked),
            }
            self._state_file.write_text(
                json.dumps(payload, ensure_ascii=True), encoding="utf-8"
            )
        except Exception as e:
            logger.warning("TomTomKeyPool: failed to persist state: %s", e)

    def _load_state(self) -> None:
        """Load persisted state when available and still for the same day."""
        try:
            if not self._state_file.exists():
                return

            payload = json.loads(self._state_file.read_text(encoding="utf-8"))
            state_date = payload.get("date")
            if state_date != self._current_date.isoformat():
                return

            usage = payload.get("usage") or {}
            blocked = payload.get("blocked") or []

            # Keep only keys that still exist in current config.
            self._usage = {
                k: int(usage.get(k, 0))
                for k in self._keys
            }
            self._blocked = {k for k in blocked if k in self._usage}
            logger.info(
                "TomTomKeyPool: restored state from %s (blocked=%d)",
                self._state_file,
                len(self._blocked),
            )
        except Exception as e:
            logger.warning("TomTomKeyPool: failed to load persisted state: %s", e)

    # ── Internal helpers ───────────────────────────────────────

    def _maybe_reset(self) -> None:
        """Reset usage counters at the start of a new calendar day."""
        today = date.today()
        if today != self._current_date:
            self._usage = {k: 0 for k in self._keys}
            self._blocked.clear()
            self._current_date = today
            self._save_state()
            logger.info("TomTomKeyPool: daily usage counters reset for %s", today)

    # ── Public API ─────────────────────────────────────────────

    def get_next_key(self) -> Optional[str]:
        """Return the available key with the lowest usage (most remaining budget).

        Returns:
            str: API key to use for the next request.
            None: All keys are exhausted or blocked for today.
        """
        with self._lock:
            self._maybe_reset()
            available = [
                k for k in self._keys
                if k not in self._blocked
                and self._usage.get(k, 0) < self._daily_limit
            ]
            if not available:
                logger.warning("TomTomKeyPool: all %d keys exhausted or blocked", len(self._keys))
                return None
            # Prefer key with fewest calls today (spreads load evenly)
            return min(available, key=lambda k: self._usage.get(k, 0))

    def record_success(self, key: str) -> None:
        """Increment daily usage counter for a successful API call."""
        with self._lock:
            self._usage[key] = self._usage.get(key, 0) + 1
            # Persist periodically to avoid excessive disk writes on every request.
            if self._usage[key] % 25 == 0:
                self._save_state()

    def mark_blocked(self, key: str) -> None:
        """Block this key for the rest of today.

        Called when TomTom returns HTTP 403 (Forbidden / entitlement issue).
        The key is re-enabled automatically next calendar day.
        """
        with self._lock:
            self._blocked.add(key)
            self._save_state()
        logger.warning(
            "TomTomKeyPool: key …%s blocked for today (403/Forbidden)", key[-8:]
        )

    # ── Properties ─────────────────────────────────────────────

    @property
    def pool_size(self) -> int:
        """Number of configured keys."""
        return len(self._keys)

    @property
    def total_daily_capacity(self) -> int:
        """Total API calls available across all keys per day."""
        return len(self._keys) * self._daily_limit

    @property
    def budget_per_cycle(self) -> int:
        """Rough per-cycle budget: total_daily ÷ active cycles per day."""
        return self.total_daily_capacity // _CYCLES_PER_ACTIVE_DAY

    @property
    def remaining_today(self) -> int:
        """Remaining calls across all non-blocked keys for today."""
        with self._lock:
            self._maybe_reset()
            return sum(
                max(0, self._daily_limit - self._usage.get(k, 0))
                for k in self._keys
                if k not in self._blocked
            )

    def status(self) -> str:
        """Human-readable pool status (for logging/debug)."""
        with self._lock:
            self._maybe_reset()
            parts = []
            for k in self._keys:
                used = self._usage.get(k, 0)
                tag = "BLOCKED" if k in self._blocked else f"{used}/{self._daily_limit}"
                parts.append(f"…{k[-8:]}: {tag}")
            return " | ".join(parts)

    def snapshot(self) -> dict:
        """Return machine-readable runtime state for diagnostics/health command."""
        with self._lock:
            self._maybe_reset()
            usage = {k: int(self._usage.get(k, 0)) for k in self._keys}
            blocked = set(self._blocked)
            exhausted = {k for k in self._keys if usage.get(k, 0) >= self._daily_limit}
            available = [k for k in self._keys if k not in blocked and k not in exhausted]
            return {
                "date": self._current_date.isoformat(),
                "daily_limit_per_key": self._daily_limit,
                "pool_size": len(self._keys),
                "available": available,
                "blocked": sorted(blocked),
                "exhausted": sorted(exhausted),
                "usage": usage,
            }


# ── Module-level singleton ──────────────────────────────────────────────────

_instance: Optional[TomTomKeyPool] = None
_init_lock = threading.Lock()


def get_key_pool() -> TomTomKeyPool:
    """Return the global TomTomKeyPool singleton (lazy-initialised from settings).

    Thread-safe double-checked locking.  Safe to call from any pipeline code.
    """
    global _instance
    if _instance is None:
        with _init_lock:
            if _instance is None:
                from src.core.config import settings  # local import to avoid circular
                keys = settings.get_tomtom_keys()
                _instance = TomTomKeyPool(
                    keys=keys,
                    daily_limit_per_key=settings.tomtom_daily_limit_per_key,
                )
    return _instance
