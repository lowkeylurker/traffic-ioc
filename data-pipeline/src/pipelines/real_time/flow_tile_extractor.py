"""Flow Tile Extractor – TomTom Traffic Flow Tile API.

Extract coarse-grained traffic flow per tile (zoom level 15) to identify hotspots.
Then optionally drill down to detail segments.

Reference:
  - TomTom Traffic Flow Tile API v4
  - Zoom 15 gives ~20km x 20km coverage per tile in HCM region
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from src.core.config import settings
from src.core.exceptions import DataExtractionError
from src.core.logger import get_logger
import time
from src.pipelines.base import BaseExtractor


class FlowTileExtractor(BaseExtractor):
    """Gọi TomTom Traffic Flow Tile API và tính traffic_index per tile."""

    BASE_URL = "https://api.tomtom.com/traffic/services/4/flowTile"
    DEFAULT_TIMEOUT = 15
    MAX_RETRIES = 2
    RETRY_WAIT = 1

    def __init__(self, api_key: str = "", key_pool=None, **kwargs: Any) -> None:
        super().__init__(api_key=api_key, **kwargs)
        self._key_pool = key_pool
        self._zoom = settings.flow_tile_zoom
        self.logger = get_logger(self.__class__.__name__)

    def _get_tile_coords(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        zoom: int,
    ) -> list[tuple[int, int, int]]:
        """Generate tile coordinates (z, x, y) for bbox at given zoom level.

        Simple grid-based tile generation (Web Mercator).
        For zoom 15 in HCM (≈10.71-10.85 lat, 106.62-106.78 lon), expect ~4-8 tiles.
        """
        from math import log, tan, cos, pi

        def lat_lon_to_tile(lat: float, lon: float, zoom: int) -> tuple[int, int]:
            """Convert (lat, lon) to Web Mercator tile (x, y) at zoom."""
            n = 2 ** zoom
            x = int((lon + 180) / 360 * n)
            lat_rad = lat * pi / 180.0
            merc_n = log(tan(pi / 4.0 + lat_rad / 2.0))
            y = int((1.0 - merc_n / pi) / 2.0 * n)
            return x, y

        try:
            x_min, y_top = lat_lon_to_tile(max_lat, min_lon, zoom)
            x_max, y_bottom = lat_lon_to_tile(min_lat, max_lon, zoom)
        except Exception as e:
            self.logger.error("Error computing tile coords: %s", e)
            return []

        # Web Mercator: y increases downward, so swap top/bottom if needed
        y_min = min(y_top, y_bottom)
        y_max = max(y_top, y_bottom)

        tiles = []
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                tiles.append((zoom, x, y))

        self.logger.debug(
            "Generated %d tiles for bbox [%.3f, %.3f, %.3f, %.3f] at zoom %d",
            len(tiles),
            min_lat,
            min_lon,
            max_lat,
            max_lon,
            zoom,
        )
        return tiles

    def _tile_to_center_point(self, tile_z: int, tile_x: int, tile_y: int) -> tuple[float, float]:
        """Convert Web Mercator tile coordinates to the tile center point."""
        from math import atan, pi, sinh

        n = 2 ** tile_z
        lon = (tile_x + 0.5) / n * 360.0 - 180.0
        lat_rad = atan(sinh(pi * (1.0 - 2.0 * (tile_y + 0.5) / n)))
        lat = lat_rad * 180.0 / pi
        return lat, lon

    def _extract_flow_segment_at_point(
        self,
        tile_z: int,
        tile_x: int,
        tile_y: int,
        key_pool=None,
    ) -> tuple[tuple[int, int, int], dict | None]:
        """Fallback to the supported flowSegmentData endpoint using the tile center."""
        lat, lon = self._tile_to_center_point(tile_z, tile_x, tile_y)
        url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
        params = {
            "point": f"{lat:.6f},{lon:.6f}",
            "unit": "KMPH",
        }

        while True:
            key = key_pool.get_next_key() if key_pool else self.api_key
            if key is None:
                return (tile_z, tile_x, tile_y), None

            params["key"] = key
            try:
                data = self._get(url, params=params)
                if key_pool:
                    key_pool.record_success(key)
                self.logger.info(
                    "Fallback flowSegmentData succeeded for tile (%d,%d,%d) at point %.6f,%.6f",
                    tile_z,
                    tile_x,
                    tile_y,
                    lat,
                    lon,
                )
                return (tile_z, tile_x, tile_y), data
            except DataExtractionError as e:
                message = e.message or ""
                detail = (e.detail or "").lower()
                if key_pool and "403" in message:
                    if "developer inactive" in detail or "over quota" in detail or "insufficientfunds" in detail:
                        key_pool.mark_blocked(key)
                        self.logger.warning(
                            "Blocking key after permanent 403 on fallback for tile (%d,%d,%d): %s",
                            tile_z,
                            tile_x,
                            tile_y,
                            detail[:120],
                        )
                        continue
                    if "over qps" in detail or "rate limit" in detail or "qps" in detail:
                        self.logger.warning(
                            "Transient rate-limit on fallback for tile (%d,%d,%d), sleeping 1s then retrying: %s",
                            tile_z,
                            tile_x,
                            tile_y,
                            detail[:120],
                        )
                        time.sleep(1)
                        continue
                    self.logger.warning(
                        "403 on fallback for tile (%d,%d,%d) with unknown reason, rotating key: %s",
                        tile_z,
                        tile_x,
                        tile_y,
                        detail[:120],
                    )
                    continue
                self.logger.debug(
                    "Fallback skip tile (%d,%d,%d): %s", tile_z, tile_x, tile_y, message
                )
                return (tile_z, tile_x, tile_y), None

    def _extract_one_tile(
        self,
        tile_z: int,
        tile_x: int,
        tile_y: int,
        key_pool=None,
    ) -> tuple[tuple[int, int, int], dict | None]:
        """Extract a single tile, retrying with next key if 403."""
        while True:
            key = key_pool.get_next_key() if key_pool else self.api_key
            if key is None:
                return (tile_z, tile_x, tile_y), None

            url = f"{self.BASE_URL}/{self._zoom}/{tile_x}/{tile_y}.json"
            params = {"key": key, "unit": "KMPH"}

            try:
                data = self._get(url, params=params)
                if key_pool:
                    key_pool.record_success(key)
                return (tile_z, tile_x, tile_y), data
            except DataExtractionError as e:
                message = e.message or ""
                detail = (e.detail or "").lower()
                if "404" in message or "not found" in detail:
                    self.logger.warning(
                        "FlowTile endpoint returned 404 for tile (%d,%d,%d), falling back to flowSegmentData at tile center",
                        tile_z,
                        tile_x,
                        tile_y,
                    )
                    return self._extract_flow_segment_at_point(tile_z, tile_x, tile_y, key_pool)
                # If TomTom returned 403, decide whether to block or retry based on body
                if key_pool and "403" in message:
                    if "developer inactive" in detail or "over quota" in detail or "insufficientfunds" in detail:
                        # Permanent for the day: block this key
                        key_pool.mark_blocked(key)
                        self.logger.warning(
                            "Blocking key after permanent 403 for tile (%d,%d,%d): %s",
                            tile_z,
                            tile_x,
                            tile_y,
                            detail[:120],
                        )
                        continue
                    if "over qps" in detail or "rate limit" in detail or "qps" in detail:
                        # Transient rate-limit on this key: sleep briefly and retry same key
                        self.logger.warning(
                            "Transient rate-limit for key on tile (%d,%d,%d), sleeping 1s then retrying: %s",
                            tile_z,
                            tile_x,
                            tile_y,
                            detail[:120],
                        )
                        time.sleep(1)
                        continue
                    # Unknown 403 reason: try next key but do not mark blocked.
                    self.logger.warning(
                        "403 for tile (%d,%d,%d) with unknown reason, rotating key: %s",
                        tile_z,
                        tile_x,
                        tile_y,
                        detail[:120],
                    )
                    continue
                self.logger.debug(
                    "Skip tile (%d,%d,%d): %s", tile_z, tile_x, tile_y, message
                )
                return (tile_z, tile_x, tile_y), None

    def extract(self, **kwargs: Any) -> dict[tuple[int, int, int], dict]:
        """Extract flow tiles for HCM bbox.

        Kwargs:
            min_lat, min_lon, max_lat, max_lon: bbox (or use from config)

        Returns:
            dict[(z,x,y)] = raw tile response
        """
        min_lat, min_lon, max_lat, max_lon = settings.get_hcm_bbox()
        tiles = self._get_tile_coords(min_lat, min_lon, max_lat, max_lon, self._zoom)

        if not tiles:
            self.logger.warning("No tiles generated for HCM bbox")
            return {}

        results_by_tile: dict[tuple[int, int, int], dict] = {}
        pool = self._key_pool
        max_workers = 4

        pool_desc = f"pool({pool.pool_size} keys)" if pool else "single-key"
        self.logger.info(
            "Extracting flow tiles for HCM: %d tiles [%s, max_workers=%d]",
            len(tiles),
            pool_desc,
            max_workers,
        )

        skipped_tiles = 0
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(
                    self._extract_one_tile, tile_z, tile_x, tile_y, pool
                ): (tile_z, tile_x, tile_y)
                for tile_z, tile_x, tile_y in tiles
            }
            for future in as_completed(future_map):
                tile_coord, data = future.result()
                if data is None:
                    skipped_tiles += 1
                    continue
                results_by_tile[tile_coord] = data

        self.logger.info(
            "Extracted %d/%d flow tiles (skipped=%d)",
            len(results_by_tile),
            len(tiles),
            skipped_tiles,
        )
        return results_by_tile
