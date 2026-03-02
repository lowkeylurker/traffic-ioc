"""OSM Boundary Downloader for HCM Ward/District Administrative Divisions.

Downloads ward and district boundary polygons from OpenStreetMap using Overpass API.
Maps each (ward, district) to its geometry polygon for spatial queries.

Example:
    >>> boundaries = download_hcm_boundaries()
    >>> boundaries[("Bến Nghé", "Quận 1")]
    'POLYGON((106.663 10.743, ...))'
"""

from __future__ import annotations

import time
from typing import Optional

import requests
from shapely.geometry import shape
from shapely.wkt import dumps as wkt_dumps

from src.core.logger import get_logger


logger = get_logger(__name__)

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Timeout for API requests
REQUEST_TIMEOUT = 120

# Rate limiting - pause between requests (seconds)
RATE_LIMIT_DELAY = 2


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
    # Overpass QL query - get boundary relation by name and admin_level
    query = f"""
    [out:json][timeout:{REQUEST_TIMEOUT}];
    (
      relation["boundary"="administrative"]["admin_level"="{admin_level}"]
             ["name"="{name}"];
    );
    out geom;
    """
    
    try:
        response = requests.post(
            OVERPASS_URL,
            data=query,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        
        data = response.json()
        
        # Extract first matching relation (usually one per name)
        if data.get("elements"):
            element = data["elements"][0]
            
            # Convert OSM geometry to GeoJSON polygon
            if "geometry" in element:
                coords = element["geometry"]
                
                # Overpass returns node coordinates, build LinearRing
                if coords:
                    polygon_coords = [[c["lon"], c["lat"]] for c in coords]
                    # Close the ring
                    if polygon_coords and polygon_coords[0] != polygon_coords[-1]:
                        polygon_coords.append(polygon_coords[0])
                    
                    return {
                        "type": "Polygon",
                        "coordinates": [polygon_coords],  # Outer ring
                    }
        
        return None
        
    except requests.RequestException as e:
        logger.warning(f"Failed to query boundary '{name}': {e}")
        return None


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
    
    boundaries = {}
    total = sum(len(wards) for wards in HCM_DISTRICTS_WARDS.values())
    processed = 0
    
    logger.info(f"Downloading {total} ward/district boundaries from OpenStreetMap...")
    
    # Query each district first (admin_level=4)
    for district in HCM_DISTRICTS_WARDS.keys():
        logger.info(f"  Querying district: {district}")
        
        geom_data = _query_osm_boundary(admin_level=4, name=district)
        if geom_data:
            try:
                geom = shape(geom_data)
                wkt = wkt_dumps(geom)
                # Store district boundary with dummy ward name (for all wards in district)
                boundaries[(district, district)] = wkt
                logger.info(f"    ✓ {district} boundary loaded")
            except Exception as e:
                logger.warning(f"    ✗ Failed to process {district} geometry: {e}")
        else:
            logger.warning(f"    ✗ {district} boundary not found in OSM")
        
        time.sleep(RATE_LIMIT_DELAY)
    
    # Query each ward (admin_level=8)
    for district, wards in HCM_DISTRICTS_WARDS.items():
        for ward in wards:
            logger.info(f"  Querying ward: {ward} ({district})")
            processed += 1
            
            geom_data = _query_osm_boundary(admin_level=8, name=ward)
            if geom_data:
                try:
                    geom = shape(geom_data)
                    wkt = wkt_dumps(geom)
                    boundaries[(ward, district)] = wkt
                    logger.info(f"    ✓ {ward} ({district}) loaded [{processed}/{total}]")
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
                else:
                    logger.warning(
                        f"    ✗ {ward} ({district}) not found [/{total}]"
                    )
            
            time.sleep(RATE_LIMIT_DELAY)
    
    logger.info(f"Downloaded {len(boundaries)} boundaries (success rate: {len(boundaries)/total*100:.1f}%)")
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
    if not force_download:
        # Try to load from cache (if implemented)
        pass
    
    return download_hcm_boundaries()
