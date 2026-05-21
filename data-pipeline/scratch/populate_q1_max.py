from sqlalchemy import create_engine, text

db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
engine = create_engine(db_url)

whitelist_names = [
    "Võ Văn Kiệt", "Đường hầm sông Sài Gòn", "Hầm Thủ Thiêm", "Cầu Khánh Hội", "Cầu Calmette", 
    "Cầu Ông Lãnh", "Cầu Nguyễn Văn Cừ", "Cầu Bông", "Cầu Thị Nghè 1", "Cầu Thị Nghè 2", 
    "Cầu Điện Biên Phủ 1", "Cầu Điện Biên Phủ 2", "Điện Biên Phủ", "Nguyễn Thị Minh Khai", 
    "Đinh Tiên Hoàng", "Nguyễn Bỉnh Khiêm", "Nguyễn Hữu Cảnh", "Tôn Đức Thắng", "Hàm Nghi", 
    "Nguyễn Thái Học", "Trần Hưng Đạo", "Cách Mạng Tháng Tám", "Hai Bà Trưng", "Lê Duẩn", 
    "Võ Thị Sáu", "Nguyễn Văn Cừ", "Phạm Hồng Thái", "Nguyễn Thị Nghĩa", "Lê Lợi", 
    "Nam Kỳ Khởi Nghĩa", "Pasteur", "Lê Lai", "Calmette", "Nguyễn Đình Chiểu", 
    "Phùng Khắc Khoan", "Nguyễn Trãi", "Phạm Ngũ Lão", "Cống Quỳnh", "Yersin", 
    "Cao Thắng", "Bà Huyện Thanh Quan", "Lê Văn Hưu", "Trần Cao Vân", "Công trường Mê Linh", 
    "Công trường Quách Thị Trang", "Công trường Cộng Hòa", "Vòng xoay Đa Kao", "Ngã sáu Phù Đổng", 
    "Ngã năm Cống Quỳnh", "Cầu Ba Son", "Ký Con", "Mạc Thị Bưởi", "Thủ Khoa Huân", 
    "Ngô Đức Kế", "Trương Định", "Lý Tự Trọng", "Lê Thánh Tôn", "Nguyễn Siêu", 
    "Đồng Khởi", "Lê Thị Hồng Gấm", "Trần Hưng Đạo B", "Hồ Tùng Mậu", "Tôn Thất Thiệp", 
    "Nguyễn Huệ", "Phó Đức Chính", "Tú Xương", "Trần Quốc Thảo", "Huỳnh Thúc Kháng", 
    "Lý Chính Thắng", "Võ Di Nguy", "Ngô Thời Nhiệm", "Nguyễn Văn Thủ", "Nguyễn Văn Giai", 
    "Nguyễn Văn Chương", "Đoàn Thị Điểm", "Nguyễn Du", "Võ Văn Tần", "Phan Văn Đạt", 
    "Lê Văn Sỹ", "Nguyễn Thông", "Trần Quý", "Hồ Hảo Hớn", "Huỳnh Tịnh Của", 
    "Phạm Viết Chánh", "Nguyễn Văn Trỗi", "Nguyễn Văn Nguyễn", "Phan Đăng Lưu", "Mậu Thân", 
    "Nguyễn Cư Trinh", "Nguyễn Công Trứ", "Bùi Viện", "Trần Bình Trọng", "Nguyễn An Ninh", 
    "Lê Hồng Phong", "Phan Chu Trinh", "Trần Quang Khải", "Hoàng Sa", "Trường Sa", 
    "Ngô Văn Năm", "Hồ Xuân Hương", "Nguyễn Văn Bình", "Đỗ Quang Đẩu", "Nguyễn Thái Bình", 
    "Phan Bội Châu", "Hàn Thuyên", "Tản Đà", "Lê Công Kiều", "Xa lộ Hà Nội"
]

with engine.begin() as conn:
    # 1. Clear 
    conn.execute(text("TRUNCATE TABLE dim_segment_q1"))
    
    # 2. Advanced selection:
    # Find ALL segments that share the same road identity as the whitelist names,
    # regardless of whether the specific segment has the name or just the road it belongs to.
    insert_sql = text("""
        INSERT INTO dim_segment_q1 (segment_key, geometry_center)
        SELECT DISTINCT s.segment_key, s.geometry_center
        FROM dim_segment s
        JOIN dim_way w ON s.way_key = w.way_key
        JOIN dim_road rd ON w.road_key = rd.road_key
        WHERE (
            rd.name = ANY(:names)
            OR rd.name ILIKE ANY(:patterns)
        )
        -- We removed the BBOX filter to catch segments that might be on the edges 
        -- but belong to these roads.
        ON CONFLICT (segment_key) DO NOTHING
    """)
    
    patterns = [f"%{name}%" for name in whitelist_names]
    
    result = conn.execute(insert_sql, {"names": whitelist_names, "patterns": patterns})
    print(f"Full Coverage population finished. Total segments: {result.rowcount}")
