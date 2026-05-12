"""Test PCU volume estimation logic.

Validates that estimate_pcu_from_speed:
1. Never exceeds 100% capacity (v/c ≤ 1.0)
2. Returns reasonable values for various speed conditions
3. Handles edge cases properly
"""

import pytest
from src.domain.math import estimate_pcu_from_speed, LANE_CAPACITY


class TestPCUEstimation:
    """Test suite for PCU volume estimation."""

    def test_never_exceeds_capacity(self):
        """Ensure v/c ratio never exceeds 1.0 (100% capacity)."""
        test_cases = [
            # (current_speed, free_flow_speed, lane_count)
            (35, 43, 3),   # Original case that was failing
            (20, 50, 2),   # Heavy congestion
            (10, 60, 4),   # Severe congestion
            (5, 40, 1),    # Near-gridlock
            (1, 50, 2),    # Extreme case
        ]
        
        for current, free_flow, lanes in test_cases:
            capacity = lanes * LANE_CAPACITY
            pcu = estimate_pcu_from_speed(current, free_flow, lanes)
            
            assert pcu <= capacity, (
                f"PCU {pcu} exceeds capacity {capacity} "
                f"(speed={current}, free_flow={free_flow}, lanes={lanes})"
            )

    def test_free_flow_conditions(self):
        """Test baseline traffic at free-flow speed."""
        # At free flow, expect ~12% capacity
        pcu = estimate_pcu_from_speed(50, 50, 2)
        capacity = 2 * LANE_CAPACITY
        expected = capacity * 0.12
        
        assert abs(pcu - expected) < 10, (
            f"Free-flow PCU {pcu} should be ~12% of capacity ({expected})"
        )

    def test_moderate_congestion(self):
        """Test moderate congestion (LOS C-D)."""
        # 70% of free-flow speed → expect 40-60% capacity
        pcu = estimate_pcu_from_speed(35, 50, 2)
        capacity = 2 * LANE_CAPACITY
        
        assert 0.3 * capacity <= pcu <= 0.7 * capacity, (
            f"Moderate congestion PCU {pcu} should be 30-70% of capacity {capacity}"
        )

    def test_heavy_congestion(self):
        """Test heavy congestion (LOS E)."""
        # 40% of free-flow speed → expect high capacity utilization
        pcu = estimate_pcu_from_speed(20, 50, 2)
        capacity = 2 * LANE_CAPACITY
        
        assert 0.6 * capacity <= pcu <= capacity, (
            f"Heavy congestion PCU {pcu} should be 60-100% of capacity {capacity}"
        )

    def test_zero_speed(self):
        """Test complete stop (speed = 0)."""
        # Complete stop → assume at capacity
        pcu = estimate_pcu_from_speed(0, 50, 2)
        capacity = 2 * LANE_CAPACITY
        
        assert pcu == capacity, (
            f"Zero speed should assume at-capacity ({capacity}), got {pcu}"
        )

    def test_negative_speed(self):
        """Test invalid negative speed."""
        # Negative speed should be treated as zero
        pcu = estimate_pcu_from_speed(-10, 50, 2)
        capacity = 2 * LANE_CAPACITY
        
        assert pcu == capacity, (
            f"Negative speed should be treated as zero (at-capacity), got {pcu}"
        )

    def test_invalid_inputs(self):
        """Test edge cases with invalid inputs."""
        # Zero free-flow speed
        assert estimate_pcu_from_speed(30, 0, 2) == 0.0
        
        # Zero lanes
        assert estimate_pcu_from_speed(30, 50, 0) == 0.0
        
        # Negative lanes
        assert estimate_pcu_from_speed(30, 50, -1) == 0.0

    def test_lane_count_scaling(self):
        """Test that PCU scales linearly with lane count."""
        speed, free_flow = 40, 50
        
        pcu_1 = estimate_pcu_from_speed(speed, free_flow, 1)
        pcu_2 = estimate_pcu_from_speed(speed, free_flow, 2)
        pcu_3 = estimate_pcu_from_speed(speed, free_flow, 3)
        
        # Should scale approximately linearly (within 5% tolerance)
        assert abs(pcu_2 / pcu_1 - 2.0) < 0.1, "PCU should scale ~2× with 2 lanes"
        assert abs(pcu_3 / pcu_1 - 3.0) < 0.1, "PCU should scale ~3× with 3 lanes"

    def test_original_failing_case(self):
        """Test the original case from user report."""
        # Original: speed=35, free_flow=43, lane_count=3
        # Was producing 6666.29 (111% capacity)
        pcu = estimate_pcu_from_speed(35, 43, 3)
        capacity = 3 * LANE_CAPACITY  # 6000
        
        assert pcu <= capacity, (
            f"Original failing case: PCU {pcu} must not exceed capacity {capacity}"
        )
        
        # Should be high utilization (80-100%) given the speed ratio
        assert 0.8 * capacity <= pcu <= capacity, (
            f"Original case should show high utilization (80-100%), got {pcu}/{capacity}"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
