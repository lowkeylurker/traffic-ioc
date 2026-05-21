from sqlalchemy import create_engine, text
import json

db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
engine = create_engine(db_url)

# 1. Deep extract all names from JSON
input_file = 'd:/DATN/traffic-ioc/data-pipeline/road_q1.json'
with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

json_names = set()
for element in data.get('elements', []):
    tags = element.get('tags', {})
    for key, value in tags.items():
        if 'name' in key:
            json_names.add(value)

# 2. User's manual list
user_names = [
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

# Merge all names
all_whitelist_names = list(json_names.union(set(user_names)))
patterns = [f"%{name}%" for name in all_whitelist_names]

with engine.begin() as conn:
    # Clear and repopulate
    conn.execute(text("TRUNCATE TABLE dim_segment_q1"))
    
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
        AND ST_Within(s.geometry_center, ST_MakeEnvelope(106.660, 10.740, 106.725, 10.810, 4326))
        ON CONFLICT (segment_key) DO NOTHING
    """)
    
    result = conn.execute(insert_sql, {"names": all_whitelist_names, "patterns": patterns})
    print(f"Deep merged population finished. Total segments in dim_segment_q1: {result.rowcount}")
