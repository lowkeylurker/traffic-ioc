# Data Warehouse — Performance Tuning & Storage Optimization

Tài liệu này tổng hợp các kỹ thuật tối ưu hóa mức vật lý, chiến lược đánh chỉ mục và push-down computation được áp dụng trên cơ sở dữ liệu **PostgreSQL 15+ / PostGIS** của hệ thống Smart Traffic IOC.

---

## 1. Phân mảnh Bảng & Cấu trúc Dữ liệu (Partitioning Strategy)

### 1.1. Declarative Table Partitioning theo Range
- **Áp dụng**: `fact_traffic_flow`, `fact_incident`.
- **Cơ chế**: Với tần suất crawl telemetry 5–15 phút cho hàng ngàn phân đoạn, `fact_traffic_flow` tích lũy hàng triệu bản ghi mỗi tuần. Bảng được phân mảnh khai báo (Declarative Partitioning) theo `date_key` (phân vùng hàng tháng, ví dụ `fact_traffic_flow_y2026m08`).
- **Lợi ích**:
  - **Partition Pruning**: PostgreSQL Query Planner tự động loại bỏ các phân vùng không nằm trong bộ lọc thời gian của câu query, giảm 90%+ I/O quét đĩa.
  - **Bảo trì & Data Retention**: Xóa dữ liệu cũ tức thời bằng `ALTER TABLE ... DROP PARTITION` thay vì lệnh `DELETE` gây lock bảng và phân mảnh đĩa.

### 1.2. Smart Keys (Khóa thay thế số nguyên)
- **Áp dụng**: `date_key` (`INT`, ví dụ `20260823`), `time_key` (`INT`, $0\dots1439$).
- **Lợi ích**: Phép JOIN trên khóa số nguyên (Integer Comparison) tiêu thụ ít CPU và RAM hơn đáng kể so với việc JOIN trên chuỗi `VARCHAR` hoặc `TIMESTAMP`.

---

## 2. Chiến lược Đánh chỉ mục chuyên sâu (Advanced Indexing)

Hệ thống áp dụng 3 loại chỉ mục chuyên biệt tùy theo bản chất của từng loại dữ liệu:

### 2.1. BRIN Index (Block Range Index)
- **Áp dụng**: Cột `timestamp` và `inserted_at` trên toàn bộ các bảng Fact (`fact_traffic_flow`, `fact_corridor_performance`).
- **Cơ chế**: Dữ liệu IoT/Traffic được nạp theo trình tự thời gian tự nhiên (Append-only / Monotonic). BRIN index chỉ lưu trữ giá trị `min`/`max` của từng khối dữ liệu vật lý (Block Range) thay vì tạo cây B-Tree cho từng dòng.
- **Hiệu quả**:
  - **Giảm 99% dung lượng index** trên đĩa (B-Tree ~ 1.5GB $\rightarrow$ BRIN ~ 15MB).
  - Tốc độ INSERT/COPY cực nhanh, không làm giảm throughput nạp của pipeline ETL.

### 2.2. GiST Index (Generalized Search Tree)
- **Áp dụng**: Cột `GEOMETRY` (`geometry_linestring`, `geometry_center` trên `dim_segment`, `geom` trên `fact_incident`).
- **Cơ chế**: Tạo cấu trúc cây R-Tree không gian đa chiều.
- **Hiệu quả**: Bắt buộc để thực thi các toán tử không gian PostGIS (`ST_DWithin`, `ST_Intersects`, `ST_TileEnvelope`, và toán tử KNN `<->` tìm láng giềng gần nhất) trong thời gian dưới 5ms.

### 2.3. GIN Index (Generalized Inverted Index)
- **Áp dụng**: Các cột dữ liệu bán cấu trúc `JSONB` (`root_causes`, `lane_links`, `traffic_light_plan`).
- **Hiệu quả**: Cho phép truy vấn trực tiếp vào các khóa con bên trong payload JSON mà không cần quét toàn bảng hay parse văn bản on-the-fly.

---

## 3. Tối ưu hóa Kiểu dữ liệu (Right-Sizing)

- **Sử dụng `TINYINT` / `SMALLINT`**: Áp dụng cho các thang đo có giới hạn giá trị nhỏ như `congestion_level` ($0\dots5$), `los_level` ($A\dots F$), `day_of_week` ($1\dots7$), `tomtom_frc` ($0\dots6$) thay vì dùng `INT` hay `BIGINT`. Tiết kiệm hàng Gigabyte bộ nhớ đệm (RAM Buffer Pool) khi quét các tập dữ liệu lớn.
- **Sử dụng `JSONB` thay vì `JSON` thuần**: Định dạng nhị phân đã parse sẵn, tăng tốc độ trích xuất thuộc tính lên 400%.

---

## 4. Đẩy Logic xuống Cơ sở Dữ liệu (Push-down Computation)

### 4.1. pgRouting cho Thuật toán Tìm đường & Tránh kẹt xe
- **Cơ chế**: Toàn bộ thuật toán tìm đường (Bidirectional A* `pgr_bdAstar`) được thực thi bằng mã C++ biên dịch sẵn ngay trong engine PostgreSQL.
- **Hiệu quả**: Backend Node.js không cần tải hàng trăm ngàn Node/Edge qua mạng để tính đồ thị, loại bỏ nghẽn mạng và nguy cơ tràn RAM Node.js heap.

### 4.2. Materialized Views Pre-computation
- **Áp dụng**: `mv_latest_traffic_status`, `view_dynamic_routing_edges`, `mv_olap_traffic_summary_*`.
- **Cơ chế**: BullMQ worker định kỳ chạy `REFRESH MATERIALIZED VIEW CONCURRENTLY` ở chế độ ngầm. API chỉ cần thực hiện phép `SELECT` từ view đã tính sẵn, giảm thời gian phản hồi từ 5–10 giây xuống dưới 15ms.

---

## 5. Tham số Cấu hình Server (PostgreSQL Tuning Guide)

Khi triển khai trên môi trường Production (Azure Database for PostgreSQL Flexible Server):

| Tham số | Giá trị khuyến nghị | Mục đích |
| :--- | :--- | :--- |
| `shared_buffers` | 25% – 40% RAM | Tăng kích thước bộ nhớ đệm để cache toàn bộ Index và Dimension tables trong RAM |
| `work_mem` | 32MB – 64MB | Cung cấp đủ bộ nhớ cho các phép `ORDER BY`, `GROUP BY`, `percentile_cont` tránh ghi tạm ra ổ đĩa (Disk Spill) |
| `random_page_cost` | 1.1 | Tối ưu cho ổ cứng SSD / Premium NVMe, giúp Query Planner ưu tiên dùng Index thay vì Sequential Scan |
| `effective_cache_size`| 50% – 75% RAM | Giúp PostgreSQL ước tính dung lượng bộ nhớ khả dụng cho OS cache |
| `maintenance_work_mem`| 512MB – 1GB | Đẩy nhanh tốc độ tạo Index, Vacuum và Refresh Materialized Views |
