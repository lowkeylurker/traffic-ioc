### 1\. Kỹ thuật Phân mảnh & Cấu trúc Bảng (Partitioning & Structuring)

*   **Declarative Table Partitioning (Phân mảnh theo Range):**
    
    *   _Áp dụng ở đâu:_ Bảng fact\_traffic\_flow, fact\_incident, fact\_traffic\_risk\_prediction.
        
    *   _Tác dụng:_ Với dữ liệu crawl 15 phút/lần, bảng Fact sẽ phình to lên hàng triệu dòng mỗi tháng. Phân mảnh theo date\_key (từng tháng/năm) giúp PostgreSQL chỉ quét (scan) đúng phân vùng chứa dữ liệu cần tìm, bỏ qua toàn bộ dữ liệu cũ. Nó cũng giúp bạn xóa dữ liệu cũ cực nhanh chỉ bằng lệnh DROP PARTITION thay vì DELETE gây lock bảng.
        
*   **Composite Primary Key cho Partition (Khóa chính phức hợp):**
    
    *   _Áp dụng ở đâu:_ PRIMARY KEY (traffic\_flow\_key, date\_key).
        
    *   _Tác dụng:_ PostgreSQL bắt buộc Partition Key phải nằm trong Primary Key. Kỹ thuật này vừa giúp duy trì tính duy nhất (Uniqueness), vừa cho phép chia nhỏ dữ liệu vật lý.
        
*   **Smart Keys (Khóa thay thế dạng số nguyên):**
    
    *   _Áp dụng ở đâu:_ Dùng INT cho date\_key (VD: 20240101) và time\_key (VD: 0-1439).
        
    *   _Tác dụng:_ Join hai bảng bằng số nguyên (INT) luôn nhanh hơn và tốn ít RAM hơn rất nhiều so với việc Join bằng chuỗi (VARCHAR) hay ngày tháng (TIMESTAMP).
        

### 2\. Chiến lược Đánh chỉ mục chuyên sâu (Advanced Indexing Strategy)

Không phải cứ dùng B-Tree là tốt. Hệ thống của bạn cần 3 loại Index khác nhau cho 3 mục đích:

*   **BRIN Index (Block Range Index):**
    
    *   _Áp dụng ở đâu:_ Các cột timestamp của tất cả các bảng Fact.
        
    *   _Tác dụng:_ Dữ liệu IoT/Traffic chảy vào DW theo trình tự thời gian. BRIN index lưu trữ giá trị min/max của các khối dữ liệu (blocks) thay vì từng dòng như B-Tree. Kết quả: **Dung lượng Index giảm tới 99%**, tốc độ insert cực nhanh mà query theo khoảng thời gian vẫn siêu việt.
        
*   **GiST Index (Generalized Search Tree):**
    
    *   _Áp dụng ở đâu:_ Các cột GEOMETRY (Point, LineString).
        
    *   _Tác dụng:_ Bắt buộc phải có để thuật toán Map Matching (PostGIS ST\_DWithin hoặc ST\_Intersects) có thể chạy. Nếu không có GiST, mọi truy vấn tìm "điểm đen sự cố gần đây" hay "vẽ bản đồ" sẽ phải quét toàn bộ bảng (Sequential Scan), làm sập DB ngay lập tức.
        
*   **GIN / btree\_gin Index:**
    
    *   _Áp dụng ở đâu:_ Các cột JSONB như traffic\_light\_plan, lane\_links.
        
    *   _Tác dụng:_ Hỗ trợ query trực tiếp vào các key bên trong chuỗi JSON của CityFlow mà không cần Parse JSON on-the-fly (vốn rất tốn CPU).
        

### 3\. Kỹ thuật Xử lý kiểu dữ liệu (Data Type Sizing)

*   **Tối ưu hóa Size cột (Right-sizing):**
    
    *   _Áp dụng ở đâu:_ Dùng TINYINT / SMALLINT cho các giá trị nhỏ (như congestion\_level, tomtom\_frc, day\_of\_week), thay vì dùng INT hay BIGINT mặc định.
        
    *   _Tác dụng:_ Tiết kiệm hàng Gigabyte dung lượng RAM/Disk khi cache các bảng Fact hàng chục triệu dòng. (Trong DB, tiết kiệm I/O Disk chính là tăng tốc độ truy vấn).
        
*   **Sử dụng JSONB thay vì JSON:**
    
    *   _Áp dụng:_ lane\_links, traffic\_light\_plan.
        
    *   _Tác dụng:_ JSONB lưu dưới dạng nhị phân (binary format) đã được parse sẵn, query nhanh hơn rất nhiều so với định dạng văn bản JSON thuần.
        

### 4\. Đẩy logic xuống Database (Push-down Computation)

*   **Dùng pgRouting thay vì Node.js cho bài toán Tìm đường (Nghiệp vụ C1):**
    
    *   _Kỹ thuật:_ Sử dụng extension pgrouting.
        
    *   _Tác dụng:_ Thay vì query hàng chục ngàn Node/Segment tải qua mạng về Backend Node.js để chạy thuật toán A-Star (gây nghẽn mạng và tràn RAM BE), bạn bắt PostgreSQL chạy thuật toán bằng C++ ngay dưới Database. BE chỉ việc nhận "kết quả lộ trình". Đây là kỹ thuật tối quan trọng cho kiến trúc hệ thống của bạn.
        
*   **Materialized Views (Khung nhìn thực thể hóa):**
    
    *   _Áp dụng ở đâu:_ Cho nghiệp vụ **A3 (So sánh tốc độ hiện tại với Baseline quá khứ)**.
        
    *   _Tác dụng:_ Thay vì mỗi lần User mở màn hình A3, DB phải GROUP BY và tính trung bình hàng triệu record của 3 tháng qua, bạn tạo một MATERIALIZED VIEW chạy ngầm vào lúc 2h sáng mỗi ngày để tính sẵn kết quả. API chỉ việc SELECT \* FROM mv\_baseline\_speed, Response time sẽ giảm từ 10s xuống còn 10ms.
        

### 5\. Cấu hình cấp hệ thống (System & Memory Tuning - Gợi ý thêm cho cấu hình Azure)

Khi deploy lên Azure PostgreSQL Flexible Server, để các kỹ thuật trên phát huy tác dụng, bạn cần cấu hình lại các tham số máy chủ (tweak parameters):

*   shared\_buffers: Tăng lên khoảng 25%-40% tổng RAM của Server (Giúp cache Index và bảng Dim vào RAM).
    
*   work\_mem: Tăng lên (VD: 16MB hoặc 32MB) để PostgreSQL có đủ bộ nhớ xử lý các phép ORDER BY, GROUP BY (rất nhiều trong hệ thống phân tích) mà không phải ghi tạm ra ổ cứng (disk spill).
    
*   random\_page\_cost: Nếu Azure dùng ổ SSD, hãy giảm tham số này từ 4.0 xuống 1.1 để Query Planner ưu tiên dùng Index thay vì scan bảng.