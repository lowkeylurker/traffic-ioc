-- ==============================================================================
-- FILE: 1_init_extensions.sql
-- DESCRIPTION: Khởi tạo Extensions và Cấu hình Database
-- ==============================================================================

-- 1. PostGIS: Xử lý dữ liệu không gian (Bắt buộc cho Geometry)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. pgRouting: Phục vụ thuật toán tìm đường trên đồ thị (Nghiệp vụ C1)
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- 3. btree_gin & pg_stat_statements: Tối ưu index và giám sát query chậm
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 4. Cấu hình Timezone cho hệ thống
ALTER DATABASE postgres SET timezone TO 'Asia/Ho_Chi_Minh';