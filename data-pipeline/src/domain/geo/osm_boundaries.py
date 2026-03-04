"""OSM Boundary Downloader for HCM Ward/District Administrative Divisions.

Downloads ward and district boundary polygons from OpenStreetMap using Overpass API.
Maps each (ward, district) to its geometry polygon for spatial queries.

Example:
    >>> boundaries = download_hcm_boundaries()
    >>> boundaries[("Bến Nghé", "Quận 1")]
    'POLYGON((106.663 10.743, ...))'
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

import requests
from shapely.geometry import shape
from shapely.wkt import dumps as wkt_dumps

from src.core.logger import get_logger


logger = get_logger(__name__)

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Nominatim API endpoint (OSM geocoding fallback)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

# Timeout for API requests
REQUEST_TIMEOUT = 120

# Rate limiting - pause between requests (seconds)
RATE_LIMIT_DELAY = 2

CACHE_FILE_NAME = "hcm_boundaries_cache.json"


def _normalize_name_variants(name: str) -> list[str]:
    """Build candidate name variants for OSM matching.

    OSM naming is inconsistent for Vietnamese admin divisions. This helper
    generates a small set of likely variants to reduce false negatives.
    """
    base = name.strip()
    variants = [base]

    if base.startswith("Quận "):
        short = base.replace("Quận ", "", 1).strip()
        variants.extend([short, f"District {short}"])
    elif base.startswith("Huyện "):
        short = base.replace("Huyện ", "", 1).strip()
        variants.extend([short, f"{short} District"])

    deduped: list[str] = []
    for value in variants:
        if value and value not in deduped:
            deduped.append(value)
    return deduped


def _extract_geojson_from_element(element: dict) -> Optional[dict]:
    """Convert Overpass element to GeoJSON polygon/multipolygon when possible."""
    if "geometry" in element and element["geometry"]:
        coords = [[c["lon"], c["lat"]] for c in element["geometry"]]
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])
        if len(coords) >= 4:
            return {"type": "Polygon", "coordinates": [coords]}

    members = element.get("members", [])
    rings = []
    for member in members:
        if member.get("type") != "way" or "geometry" not in member:
            continue
        coords = [[c["lon"], c["lat"]] for c in member["geometry"]]
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])
        if len(coords) >= 4:
            rings.append(coords)

    if rings:
        return {"type": "MultiPolygon", "coordinates": [[[ring] for ring in rings]][0]}

    return None


def _query_osm_boundary(admin_level: int, name: str) -> Optional[dict]:
    """Query OpenStreetMap for administrative boundary by name.
    
    Args:
        admin_level: OSM administrative level (4=district, 8=ward)
        name: Name of the administrative division
        
    Returns:
        GeoJSON feature dict with geometry, or None if not found
        
    Raises:
        requests.RequestException: Network error connecting to Overpass API
    """
    try:
        for candidate in _normalize_name_variants(name):
            # First try: constrain search to HCM city area to avoid wrong matches
            query_area = f"""
            [out:json][timeout:{REQUEST_TIMEOUT}];
            area["boundary"="administrative"]["admin_level"="4"]["name"="Thành phố Hồ Chí Minh"]->.hcm;
            (
              relation(area.hcm)["boundary"="administrative"]["admin_level"="{admin_level}"]["name"="{candidate}"];
              relation(area.hcm)["boundary"="administrative"]["admin_level"="{admin_level}"]["name:vi"="{candidate}"];
              relation(area.hcm)["boundary"="administrative"]["admin_level"="{admin_level}"]["official_name"="{candidate}"];
            );
            out geom;
            """

            try:
                response = requests.post(OVERPASS_URL, data=query_area, timeout=REQUEST_TIMEOUT)
                response.raise_for_status()
                data = response.json()

                for element in data.get("elements", []):
                    geom = _extract_geojson_from_element(element)
                    if geom:
                        return geom
            except requests.RequestException:
                logger.debug(
                    f"Area-scoped query failed for '{candidate}' (level={admin_level}), trying global fallback"
                )

            # Fallback: global search by candidate name (some datasets miss area linkage)
            query_global = f"""
            [out:json][timeout:{REQUEST_TIMEOUT}];
            (
              relation["boundary"="administrative"]["admin_level"="{admin_level}"]["name"="{candidate}"];
              relation["boundary"="administrative"]["admin_level"="{admin_level}"]["name:vi"="{candidate}"];
              relation["boundary"="administrative"]["admin_level"="{admin_level}"]["official_name"="{candidate}"];
            );
            out geom;
            """

            try:
                response = requests.post(OVERPASS_URL, data=query_global, timeout=REQUEST_TIMEOUT)
                response.raise_for_status()
                data = response.json()

                for element in data.get("elements", []):
                    geom = _extract_geojson_from_element(element)
                    if geom:
                        return geom
            except requests.RequestException:
                logger.debug(
                    f"Global query failed for '{candidate}' (level={admin_level}), trying next candidate"
                )

        # Final fallback: Nominatim polygon lookup (still OSM-backed)
        for candidate in _normalize_name_variants(name):
            params = {
                "q": f"{candidate}, Ho Chi Minh City, Vietnam",
                "format": "jsonv2",
                "polygon_geojson": 1,
                "limit": 5,
            }
            headers = {"User-Agent": "traffic-ioc-data-pipeline/1.0"}
            try:
                response = requests.get(
                    NOMINATIM_URL,
                    params=params,
                    headers=headers,
                    timeout=REQUEST_TIMEOUT,
                )
                response.raise_for_status()
                items = response.json()

                for item in items:
                    geojson = item.get("geojson")
                    if not geojson:
                        continue

                    class_name = item.get("class", "")
                    type_name = item.get("type", "")
                    if class_name == "boundary" or type_name == "administrative":
                        return geojson

                if items:
                    # Return first geometry as last resort
                    geojson = items[0].get("geojson")
                    if geojson:
                        return geojson
            except requests.RequestException:
                logger.debug(f"Nominatim fallback failed for '{candidate}'")

        return None
    except requests.RequestException as e:
        logger.warning(f"Failed to query boundary '{name}': {e}")
        return None


def _default_cache_path() -> Path:
    return Path(__file__).resolve().parents[3] / "cache" / CACHE_FILE_NAME


def _load_boundaries_cache(cache_path: Path) -> Optional[dict[tuple[str, str], str]]:
    if not cache_path.exists():
        return None

    try:
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        boundaries = {
            tuple(key.split("|||", 1)): value
            for key, value in data.items()
            if "|||" in key
        }
        if boundaries:
            return boundaries
    except Exception as e:
        logger.warning(f"Failed to read boundaries cache {cache_path}: {e}")
    return None


def _save_boundaries_cache(cache_path: Path, boundaries: dict[tuple[str, str], str]) -> None:
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        data = {f"{ward}|||{district}": wkt for (ward, district), wkt in boundaries.items()}
        cache_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning(f"Failed to write boundaries cache {cache_path}: {e}")


def download_hcm_boundaries(
    use_cache: bool = True,
    cache_file: Optional[str] = None,
) -> dict[tuple[str, str], str]:
    """Download all HCM ward and district boundaries from OpenStreetMap.
    
    Fetches administrative boundaries for:
    - 19 urban districts (Quận 1-12, Bình Tân, Bình Thạnh, Gò Vấp, Phú Nhuận, etc.)
    - 5 rural districts (Huyện Bình Chánh, Cần Giờ, Củ Chi, Hóc Môn, Nhà Bè)
    - ~312 wards/communes
    
    Caches results to avoid repeated API calls.
    
    Args:
        use_cache: Whether to load from cache if available
        cache_file: Path to cache file (JSON format) - defaults to temp directory
        
    Returns:
        dict mapping (ward_name, district_name) tuple to WKT polygon string
        
    Example:
        >>> boundaries = download_hcm_boundaries()
        >>> wkt = boundaries[("Bến Nghé", "Quận 1")]
        >>> print(wkt[:50])
        'POLYGON((106.663 10.743, 106.664 10.744, ...))'
    """
    from src.domain.geo.hcm_locations import HCM_DISTRICTS_WARDS
    
    cache_path = Path(cache_file) if cache_file else _default_cache_path()
    boundaries: dict[tuple[str, str], str] = {}
    if use_cache:
        cached = _load_boundaries_cache(cache_path)
        if cached:
            boundaries.update(cached)
            logger.info(f"Loaded {len(cached)} cached boundaries from: {cache_path}")
    total = sum(len(wards) for wards in HCM_DISTRICTS_WARDS.values())
    processed = 0
    
    logger.info(f"Downloading {total} ward/district boundaries from OpenStreetMap...")
    
    # Query each district first (admin_level=6 in VN; some rural districts may be 7)
    for district in HCM_DISTRICTS_WARDS.keys():
        if (district, district) in boundaries:
            logger.info(f"  Skipping district (cached): {district}")
            continue

        logger.info(f"  Querying district: {district}")

        district_levels = [6, 7] if district.startswith("Huyện ") else [6]
        geom_data = None
        for level in district_levels:
            geom_data = _query_osm_boundary(admin_level=level, name=district)
            if geom_data:
                break

        if geom_data:
            try:
                geom = shape(geom_data)
                wkt = wkt_dumps(geom)
                # Store district boundary with dummy ward name (for all wards in district)
                boundaries[(district, district)] = wkt
                logger.info(f"    ✓ {district} boundary loaded")
                if use_cache:
                    _save_boundaries_cache(cache_path, boundaries)
            except Exception as e:
                logger.warning(f"    ✗ Failed to process {district} geometry: {e}")
        else:
            logger.warning(f"    ✗ {district} boundary not found in OSM")
        
        time.sleep(RATE_LIMIT_DELAY)
    
    # Query each ward (admin_level=8)
    for district, wards in HCM_DISTRICTS_WARDS.items():
        for ward in wards:
            if (ward, district) in boundaries:
                processed += 1
                logger.info(f"  Skipping ward (cached): {ward} ({district}) [{processed}/{total}]")
                continue

            logger.info(f"  Querying ward: {ward} ({district})")
            processed += 1
            
            geom_data = _query_osm_boundary(admin_level=8, name=ward)
            if geom_data:
                try:
                    geom = shape(geom_data)
                    wkt = wkt_dumps(geom)
                    boundaries[(ward, district)] = wkt
                    logger.info(f"    ✓ {ward} ({district}) loaded [{processed}/{total}]")
                    if use_cache:
                        _save_boundaries_cache(cache_path, boundaries)
                except Exception as e:
                    logger.warning(
                        f"    ✗ {ward} ({district}) geometry error: {e} [{processed}/{total}]"
                    )
            else:
                # Fallback to district boundary if ward not found
                if (district, district) in boundaries:
                    boundaries[(ward, district)] = boundaries[(district, district)]
                    logger.info(
                        f"    ~ {ward} ({district}) using district boundary [{processed}/{total}]"
                    )
                    if use_cache:
                        _save_boundaries_cache(cache_path, boundaries)
                else:
                    logger.warning(
                        f"    ✗ {ward} ({district}) not found [/{total}]"
                    )
            
            time.sleep(RATE_LIMIT_DELAY)
    
    logger.info(f"Downloaded {len(boundaries)} boundaries (success rate: {len(boundaries)/total*100:.1f}%)")
    if use_cache and boundaries:
        _save_boundaries_cache(cache_path, boundaries)
        logger.info(f"Saved boundaries cache: {cache_path}")
    return boundaries


def get_or_download_boundaries(
    force_download: bool = False,
) -> dict[tuple[str, str], str]:
    """Get HCM boundaries with optional caching.
    
    Args:
        force_download: Force fresh download even if cached
        
    Returns:
        dict mapping (ward, district) to WKT polygon
    """
    return download_hcm_boundaries(use_cache=not force_download)
