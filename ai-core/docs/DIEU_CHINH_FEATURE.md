PHẦN 1: TẦNG TRÍCH XUẤT DỮ LIỆU (SQL / PANDAS LEVEL)
Trước khi dữ liệu chạm vào Môi trường RL, luồng ETL hoặc câu lệnh truy vấn (Query) của bạn cần thực hiện các thao tác sau:
1. Lọc Dữ liệu (Filtering):
Áp dụng điều kiện: WHERE is_closed = false (Loại bỏ các đoạn đường đang cấm/đóng cửa).
2. Tính toán Đặc trưng Mới (Feature Creation):
Tỷ lệ tốc độ: Tạo cột speed_ratio = current_speed_kmh / free_flow_speed_kmh.
Gia tốc: Tạo cột speed_delta = current_speed_kmh(t) - current_speed_kmh(t-1) (Sử dụng hàm LAG() trong SQL hoặc shift() trong Pandas trên các cửa sổ thời gian).
Định danh Không gian: Tạo cột ward_district_id bằng cách ghép chuỗi hoặc mã hóa từ hai cột ward và district (trong bảng dim_location).
3. Khai báo Nhãn (Target):
Trích xuất cột congestion_level (Giữ nguyên 6 nhãn từ 0 đến 5).

PHẦN 2: BẢN HỢP ĐỒNG GIAO TIẾP (PYTHON ENVIRONMENT LEVEL)
Cấu trúc các mảng đặc trưng được nạp vào hàm step() và reset() của Môi trường Gymnasium sẽ được chốt cứng như sau:
1. Biến động Thời gian thực (DYNAMIC_FEATURE_COLS) (Cấu trúc: Ma trận 12 mốc thời gian. Số lượng: 6 thông số)
current_speed_kmh
traffic_index
delay_seconds
quality_flag
speed_ratio (Đặc trưng mới - Cực kỳ quan trọng)
speed_delta (Đặc trưng mới - Chỉ báo sóng xung kích) (Đã loại bỏ pcu_volume)
2. Vật lý & Môi trường tĩnh (STATIC_MODEL_FEATURE_COLS) (Cấu trúc: Vector 1D, đưa thẳng vào lớp Linear. Số lượng: 7 thông số)
default_lane_count
free_flow_speed_kmh (Thay tên từ static_free_flow)
time_sin
time_cos
is_one_way (Bổ sung từ dim_segment)
is_business_hours (Bổ sung từ dim_time_of_day)
is_weekend (Bổ sung từ dim_date)
3. Đặc trưng Phân loại (CATEGORICAL_FEATURE_COLS) (Cấu trúc: Số nguyên định danh ID. Số lượng: 5 thông số)
tomtom_frc (Thay cho osm_highway_type)
ward_district_id (Thay thế cho district đơn thuần) (Đây là cặp đôi district và ward trong dim_location)
weather_key (Thay cho weather_severity)
shift_code
day_of_week
