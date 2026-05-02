"""Time series sliding-window helpers."""

from __future__ import annotations
import numpy as np

def find_valid_window_starts(
    timestamps,
    segment_keys,
    window_size: int,
    step_minutes: int,
) -> list[int]:
    """Return start indices whose windows are continuous within one segment.
    Optimized vectorized version for large datasets.
    """
    if len(timestamps) <= window_size:
        return []

    ts = np.asarray(timestamps, dtype='datetime64[ns]')
    keys = np.asarray(segment_keys)
    
    # Calculate deltas between start and end of potential windows
    # Window size 'W' requires W intervals to span W+1 rows.
    # If we want a window of 12 rows + 1 target = 13 rows total.
    # The caller passes window_size (e.g. 12 or 13).
    
    # Check segment continuity: keys[i] == keys[i + window_size]
    key_match = keys[:-window_size] == keys[window_size:]
    
    # Check time continuity: ts[i + window_size] - ts[i] == window_size * step
    # Convert to minutes to avoid nanosecond precision issues (jitter)
    actual_deltas_min = (ts[window_size:] - ts[:-window_size]).astype('timedelta64[m]').astype(int)
    expected_delta_min = int(window_size * step_minutes)
    time_match = (actual_deltas_min == expected_delta_min)
    
    valid_mask = key_match & time_match
    return np.where(valid_mask)[0].tolist()
