from sqlalchemy import create_engine, text

db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
engine = create_engine(db_url)

road_names = [
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

with engine.connect() as conn:
    # Check which names are missing
    found_names_sql = text("""
        SELECT DISTINCT rd.name
        FROM dim_road rd
        WHERE rd.name = ANY(:names)
    """)
    found_names = {r[0] for r in conn.execute(found_names_sql, {"names": road_names})}
    
    missing = [name for name in road_names if name not in found_names]
    print(f"Missing roads (exact match): {len(missing)}")
    import sys
    for name in missing:
        sys.stdout.buffer.write(f" - {name}\n".encode('utf-8'))
    if len(missing) > 10:
        print(" ...")
