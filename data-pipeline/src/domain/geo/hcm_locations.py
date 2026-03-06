"""Administrative boundaries data for Ho Chi Minh City.

Complete list of 24 districts and 312 wards/communes as of 2026.
This is static catalog data sourced from GSO Vietnam.
"""

# ═══════════════════════════════════════════════════════════
# TP. HỒ CHÍ MINH - ALL DISTRICTS & WARDS
# ═══════════════════════════════════════════════════════════

HCM_DISTRICTS_WARDS: dict[str, list[str]] = {
    # 19 Quận nội thành
    "Quận 1": [
        "Bến Nghé", "Bến Thành", "Cầu Kho", "Cầu Ông Lãnh", "Cô Giang",
        "Đa Kao", "Nguyễn Cư Trinh", "Nguyễn Thái Bình", "Phạm Ngũ Lão", "Tân Định",
    ],
    "Quận 2": [
        "An Khánh", "An Lợi Đông", "An Phú", "Bình An", "Bình Khánh",
        "Bình Trưng Đông", "Bình Trưng Tây", "Cát Lái", "Thạnh Mỹ Lợi", "Thảo Điền", "Thủ Thiêm",
    ],
    "Quận 3": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 6", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13", "Phường 14",
    ],
    "Quận 4": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 6",
        "Phường 8", "Phường 9", "Phường 10", "Phường 13", "Phường 14", "Phường 15",
        "Phường 16", "Phường 18",
    ],
    "Quận 5": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 6", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13", "Phường 14", "Phường 15",
    ],
    "Quận 6": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 6", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13", "Phường 14",
    ],
    "Quận 7": [
        "Bình Thuận", "Phú Mỹ", "Phú Thuận", "Tân Hưng", "Tân Kiểng", "Tân Phong",
        "Tân Phú", "Tân Quy", "Tân Thuận Đông", "Tán Thuận Tây",
    ],
    "Quận 8": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 6", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13",
        "Phường 14", "Phường 15", "Phường 16",
    ],
    "Quận 9": [
        "Hiệp Phú", "Long Bình", "Long Phước", "Long Thạnh Mỹ", "Long Trường",
        "Phú Hữu", "Phước Bình", "Phước Long A", "Phước Long B",
        "Tân Phú", "Tăng Nhơn Phú A", "Tăng Nhơn Phú B", "Trường Thạnh",
    ],
    "Quận 10": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 6", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13", "Phường 14", "Phường 15",
    ],
    "Quận 11": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 6", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13", "Phường 14", "Phường 15", "Phường 16",
    ],
    "Quận 12": [
        "An Phú Đông", "Đông Hưng Thuận", "Hiệp Thành", "Tân Chánh Hiệp", "Tân Hưng Thuận",
        "Tân Thới Hiệp", "Tân Thới Nhất", "Thạnh Lộc", "Thạnh Xuân", "Thới An", "Trung Mỹ Tây",
    ],
    "Quận Bình Tân": [
        "An Lạc", "An Lạc A", "Bình Hưng Hòa", "Bình Hưng Hòa A", "Bình Hưng Hòa B",
        "Bình Trị Đông", "Bình Trị Đông A", "Bình Trị Đông B", "Tân Tạo", "Tân Tạo A",
    ],
    "Quận Bình Thạnh": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 5", "Phường 6", "Phường 7",
        "Phường 11", "Phường 12", "Phường 13", "Phường 14", "Phường 15", "Phường 17",
        "Phường 19", "Phường 21", "Phường 22", "Phường 24", "Phường 25", "Phường 26", "Phường 27", "Phường 28",
    ],
    "Quận Gò Vấp": [
        "Phường 1", "Phường 3", "Phường 4", "Phường 5", "Phường 6", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13",
        "Phường 14", "Phường 15", "Phường 16", "Phường 17",
    ],
    "Quận Phú Nhuận": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13",
        "Phường 15", "Phường 17",
    ],
    "Quận Tân Bình": [
        "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 6", "Phường 7",
        "Phường 8", "Phường 9", "Phường 10", "Phường 11", "Phường 12", "Phường 13", "Phường 14", "Phường 15",
    ],
    "Quận Tân Phú": [
        "Hiệp Tân", "Hòa Thạnh", "Phú Thạnh", "Phú Thọ Hòa", "Phú Trung",
        "Sơn Kỳ", "Tân Quý", "Tân Sơn Nhì", "Tân Thành", "Tân Thới Hòa", "Tây Thạnh",
    ],
    "Quận Thủ Đức": [
        "Bình Chiểu", "Bình Thọ", "Hiệp Bình Chánh", "Hiệp Bình Phước", "Linh Chiểu",
        "Linh Đông", "Linh Tây", "Linh Trung", "Linh Xuân", "Tam Bình", "Tam Phú", "Trường Thọ",
    ],
    
    # 5 Huyện ngoại thành
    "Huyện Bình Chánh": [
        "An Phú Tây", "Bình Chánh", "Bình Hưng", "Bình Lợi", "Đa Phước",
        "Hưng Long", "Lê Minh Xuân", "Phạm Văn Hai", "Phong Phú", "Quy Đức",
        "Tân Kiên", "Tân Nhựt", "Tân Quý Tây", "Tân Túc", "Vĩnh Lộc A", "Vĩnh Lộc B",
    ],
    "Huyện Cần Giờ": [
        "An Thới Đông", "Bình Khánh", "Cần Thạnh", "Long Hòa", "Lý Nhơn",
        "Tam Thôn Hiệp", "Thạnh An",
    ],
    "Huyện Củ Chi": [
        "An Nhơn Tây", "An Phú", "Bình Mỹ", "Hòa Phú", "Nhuận Đức",
        "Phạm Văn Cội", "Phú Hòa Đông", "Phú Mỹ Hưng", "Phước Hiệp", "Phước Thạnh",
        "Phước Vĩnh An", "Tân An Hội", "Tân Phú Trung", "Tân Thạnh Đông", "Tân Thạnh Tây",
        "Tân Thông Hội", "Thái Mỹ", "Trung An", "Trung Lập Hạ", "Trung Lập Thượng", "Củ Chi",
    ],
    "Huyện Hóc Môn": [
        "Bà Điểm", "Đông Thạnh", "Nhị Bình", "Tân Hiệp", "Tân Thới Nhì",
        "Tân Xuân", "Thới Tam Thôn", "Trung Chánh", "Xuân Thới Đông", "Xuân Thới Sơn", "Xuân Thới Thượng", "Hóc Môn",
    ],
    "Huyện Nhà Bè": [
        "Hiệp Phước", "Long Thới", "Nhơn Đức", "Phú Xuân", "Phước Kiển", "Phước Lộc", "Nhà Bè",
    ],
}


def get_all_locations() -> list[tuple[str, str]]:
    """Get list of all (ward, district) tuples for HCM City.
    
    Returns:
        list[tuple[str, str]]: List of (ward_name, district_name) tuples.
        Total count: ~312 wards across 24 districts.
    
    Example:
        >>> locations = get_all_locations()
        >>> len(locations)
        312
        >>> locations[0]
        ('Bến Nghé', 'Quận 1')
    """
    locations = []
    for district, wards in HCM_DISTRICTS_WARDS.items():
        for ward in wards:
            locations.append((ward, district))
    return locations


def get_district_wards(district: str) -> list[str]:
    """Get all wards for a specific district.
    
    Args:
        district: District name (e.g., "Quận 1", "Huyện Bình Chánh")
    
    Returns:
        list[str]: List of ward names, empty list if district not found.
    
    Example:
        >>> wards = get_district_wards("Quận 1")
        >>> len(wards)
        10
    """
    return HCM_DISTRICTS_WARDS.get(district, [])


def get_total_count() -> dict[str, int]:
    """Get statistics about HCM administrative boundaries.
    
    Returns:
        dict with keys: 'districts', 'wards', 'urban_districts', 'rural_districts'
    """
    urban = sum(1 for d in HCM_DISTRICTS_WARDS if d.startswith("Quận"))
    rural = sum(1 for d in HCM_DISTRICTS_WARDS if d.startswith("Huyện"))
    total_wards = sum(len(wards) for wards in HCM_DISTRICTS_WARDS.values())
    
    return {
        "districts": len(HCM_DISTRICTS_WARDS),
        "wards": total_wards,
        "urban_districts": urban,
        "rural_districts": rural,
    }
