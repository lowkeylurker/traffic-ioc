"""Time series sliding-window helpers."""

from __future__ import annotations

import numpy as np


def find_valid_window_starts(
	timestamps,
	segment_keys,
	window_size: int,
	step_minutes: int,
) -> list[int]:
	"""Return start indices whose windows are continuous within one segment."""
	timestamps = np.asarray(timestamps)
	segment_keys = np.asarray(segment_keys)
	valid_indices: list[int] = []
	expected_delta = np.timedelta64(window_size * step_minutes, "m")

	total_rows = len(timestamps)
	for start_idx in range(total_rows - window_size):
		target_idx = start_idx + window_size
		same_segment = segment_keys[start_idx] == segment_keys[target_idx]
		continuous_time = (timestamps[target_idx] - timestamps[start_idx]) == expected_delta
		if same_segment and continuous_time:
			valid_indices.append(start_idx)

	return valid_indices
