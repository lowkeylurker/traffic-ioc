"""Unit tests for adaptive Flow Tile components (no external API/DB required).

Run:
    python tests/test_flow_tile_unit.py
"""

from __future__ import annotations

from src.pipelines.real_time.flow_tile_extractor import FlowTileExtractor
from src.pipelines.real_time.hotspot_detector import HotspotDetector
from src.pipelines.real_time.segment_mapper import SegmentMapper


def test_tile_coord_generation() -> None:
    extractor = FlowTileExtractor(api_key="dummy")
    tiles = extractor._get_tile_coords(10.71, 106.62, 10.85, 106.78, 15)
    assert len(tiles) > 0
    assert all(len(t) == 3 for t in tiles)


def test_tile_center_conversion() -> None:
    extractor = FlowTileExtractor(api_key="dummy")
    lat, lon = extractor._tile_to_center_point(15, 26094, 15397)
    assert 10.0 < lat < 11.0
    assert 106.0 < lon < 107.5


def test_tile_to_bbox_hcm_range() -> None:
    mapper = SegmentMapper(engine=None)  # type: ignore[arg-type]
    lat_min, lon_min, lat_max, lon_max = mapper.tile_to_bbox(15, 26094, 15397)
    assert 10.0 < lat_min < 11.0
    assert 10.0 < lat_max < 11.0
    assert 106.0 < lon_min < 107.5
    assert 106.0 < lon_max < 107.5


def test_hotspot_detector_shape_flow_segment_data() -> None:
    detector = HotspotDetector(threshold=0.10)
    hotspot = detector.analyze_tile(
        tile_z=15,
        tile_x=27301,
        tile_y=13755,
        tile_data={"flowSegmentData": {"currentSpeed": 20}},
    )
    assert hotspot is not None
    assert hotspot.traffic_index > 0.10


def test_hotspot_detector_shape_data_list() -> None:
    detector = HotspotDetector(threshold=0.10)
    hotspot = detector.analyze_tile(
        tile_z=15,
        tile_x=27301,
        tile_y=13755,
        tile_data={
            "data": [
                {"currentFlow": {"speed": 30}},
                {"currentFlow": {"speed": 35}},
            ]
        },
    )
    assert hotspot is not None
    assert 0 <= hotspot.traffic_index <= 1


def test_baseline_sampler() -> None:
    candidates = [
        {"segment_key": 1},
        {"segment_key": 2},
        {"segment_key": 3},
        {"segment_key": 4},
        {"segment_key": 5},
        {"segment_key": 6},
        {"segment_key": 7},
        {"segment_key": 8},
        {"segment_key": 9},
        {"segment_key": 10},
    ]
    sampled, inferred = SegmentMapper.sample_baseline_candidates(candidates, ratio=0.3)
    assert len(sampled) == 3
    assert len(inferred) == 7
    assert sampled[0]["segment_key"] == 1


def run_all() -> None:
    test_tile_coord_generation()
    test_hotspot_detector_shape_flow_segment_data()
    test_hotspot_detector_shape_data_list()
    test_tile_to_bbox_hcm_range()
    test_baseline_sampler()
    print("OK: Flow tile unit tests passed")


if __name__ == "__main__":
    run_all()
