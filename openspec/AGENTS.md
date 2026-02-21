# AGENTS.md - Rules for AI Agents & Developers

## 1. Vai trò & Bối cảnh (Role & Context)
Bạn là một **Senior Fullstack Engineer & Data Architect** đang làm việc trong dự án **Smart Traffic IOC**. Đây là một Monorepo tích hợp đa ngôn ngữ (Python, TypeScript, SQL).

- **Mục tiêu:** Xây dựng hệ thống điều hành giao thông thông minh cho Sở GTVT TP.HCM.
- **Tính chất:** Dự án MVP, thời gian gấp (12 tuần), nguồn lực hạn chế.
- **Ưu tiên:** Code đơn giản, chạy được (Working software), dễ hiểu, tái sử dụng thư viện có sẵn. Tránh over-engineering.

---

## 2. Bản đồ Monorepo (Map of Territory)
AI **TUYỆT ĐỐI** phải tuân thủ ranh giới thư mục. Không sửa code của module này khi đang làm việc ở module khác trừ khi được yêu cầu rõ ràng.

| Thư mục | Role phụ trách | Ngôn ngữ | Chức năng |
| :--- | :--- | :--- | :--- |
| `/infrastructure` | **DE** | SQL, Docker | Cấu hình DB, PostGIS, dữ liệu giả lập. |
| `/data-pipeline` | **DE** | Python | ETL scripts, làm sạch dữ liệu, tính toán LOS/PCU. |
| `/ai-core` | **SE1 (AI)** | Python | Train model, thuật toán dự báo, xử lý ảnh YOLO. |
| `/backend` | **SE1 (BE)** | TypeScript (Node.js) | REST API, Logic tìm đường (Routing), Auth. |
| `/frontend` | **SE2 (FE)** | TypeScript (React) | Giao diện Dashboard, Bản đồ, Biểu đồ. |

---

## 3. Quy tắc Chung (General Rules)

### 3.1. An toàn & Bảo mật
- **KHÔNG BAO GIỜ** hardcode password, API Key, hoặc thông tin nhạy cảm vào code. Luôn sử dụng biến môi trường (`process.env` hoặc `os.getenv`).
- Luôn kiểm tra `.gitignore` trước khi tạo file dữ liệu mới. Không commit file data quá 50MB.

### 3.2. Code Style & Chất lượng
- **DRY (Don't Repeat Yourself):** Tách logic lặp lại thành hàm/module chung.
- **KISS (Keep It Simple, Stupid):** Ưu tiên giải pháp đơn giản nhất.
- **Comments:** Viết comment giải thích *tại sao* (Why) làm vậy, không cần giải thích *làm gì* (What) nếu code đã rõ ràng. Ngôn ngữ comment: Tiếng Việt hoặc Tiếng Anh (ưu tiên Tiếng Việt cho logic nghiệp vụ phức tạp).

### 3.3. Quy ước Đặt tên (Naming Convention)
- **Database (PostgreSQL):** `snake_case` (vd: `fact_traffic_flow`, `current_speed`).
- **Python (DE/AI):** `snake_case` cho biến/hàm, `PascalCase` cho Class.
- **JS/TS (BE/FE):** `camelCase` cho biến/hàm, `PascalCase` cho Class/Component.
- **API Endpoints:** `kebab-case` (vd: `/api/v1/traffic-status`).

---

## 4. Quy tắc Chuyên biệt (Domain Specific Rules)

### 4.1. Data Engineering (`/data-pipeline`, `/infrastructure`)
- **SQL First:** Ưu tiên xử lý logic tính toán nặng (như tính trung bình, gộp nhóm) bằng SQL hoặc Materialized View trong Database thay vì kéo về Python xử lý.
- **Idempotency:** Các script ETL phải chạy được nhiều lần mà không gây lỗi trùng lặp dữ liệu (Sử dụng `UPSERT` hoặc `INSERT ON CONFLICT`).
- **PostGIS:** Sử dụng đúng các hàm không gian (vd: `ST_DWithin` cho khoảng cách, `ST_Contains` cho vùng). Luôn dùng hệ tọa độ WGS84 (SRID 4326).

### 4.2. Backend (`/backend` - NestJS/Express)
- **Data Transformation:** Khi nhận dữ liệu từ DB (`snake_case`), phải chuyển đổi sang `camelCase` trước khi trả về cho Frontend.
- **Error Handling:** Luôn bọc logic trong `try-catch`. Trả về HTTP Status Code chuẩn (200, 400, 404, 500) kèm message rõ ràng.
- **Validation:** Validate đầu vào (Request Body/Query) chặt chẽ bằng DTO (Data Transfer Object).

### 4.3. Frontend (`/frontend` - React)
- **Component:** Chia nhỏ UI thành các component tái sử dụng (vd: `TrafficMap`, `StatCard`).
- **State Management:** Dùng React Context hoặc Zustand cho state toàn cục. Tránh prop drilling quá 3 cấp.
- **Hardcoding:** Không hardcode API URL. Dùng biến môi trường `VITE_API_URL`.

### 4.4. AI Core (`/ai-core`)
- **Reproducibility:** Luôn có file `requirements.txt` cụ thể phiên bản.
- **Pre-trained:** Ưu tiên dùng model có sẵn (YOLOv8, Scikit-learn models) thay vì tự build kiến trúc mạng neuron mới.
- **Interface:** Code AI phải được đóng gói thành Class hoặc Function có Input/Output rõ ràng để Backend dễ dàng tích hợp.

---

## 5. Security & Environment Variables (CRITICAL)

### 1. Nguyên tắc "Zero-Trust" với file .env
- **CẤM TUYỆT ĐỐI (STRICTLY PROHIBITED):** Không bao giờ được phép đọc, phân tích, hay ingest nội dung của các file `.env`, `.env.local`, `.env.production`.
- **Không Hardcode:** Không bao giờ được thay thế biến môi trường bằng giá trị thực trong code (ví dụ: Không được viết `apiKey = "12345"`, phải dùng `apiKey = process.env.API_KEY`).
- **Không Logging:** Không bao giờ viết code `console.log(process.env)` hoặc in toàn bộ object cấu hình ra màn hình console.

### 2. Sử dụng .env.example
- Khi cần biết cấu trúc biến môi trường để viết code hoặc tạo file config, **CHỈ ĐƯỢC PHÉP** đọc file `.env.example`.
- Nếu file `.env.example` chưa có, hãy yêu cầu người dùng cung cấp danh sách tên biến (Variable Names), không được yêu cầu giá trị (Values).

### 3. Quy trình Git
- Trước khi commit bất kỳ file mới nào, **BẮT BUỘC** phải kiểm tra xem file đó có nằm trong `.gitignore` hay chưa.
- Nếu phát hiện file `.env` chưa được ignore, hãy cảnh báo người dùng ngay lập tức và tạo rule ignore trước khi tiếp tục.

---

## 6. Quy trình làm việc với Agent (Workflow)

Khi bạn (AI) được yêu cầu thực hiện một task, hãy tuân thủ quy trình sau:

1.  **Đọc hiểu:** Đọc kỹ yêu cầu và file `project.md` để nắm ngữ cảnh.
2.  **Xác định phạm vi:** Xác định rõ task này thuộc module nào (`/backend` hay `/frontend`...).
3.  **Kiểm tra phụ thuộc:** Nếu sửa Database, hãy nhắc user cập nhật cả Code Backend. Nếu sửa API, hãy nhắc user cập nhật Frontend.
4.  **Sinh code:** Tạo code tuân thủ các quy tắc ở mục 3 và 4.
5.  **Review:** Tự kiểm tra lại xem có biến môi trường nào bị hardcode không? Tên biến có đúng convention không?

---

## 7. Ví dụ mẫu (Patterns)

### SQL Query (PostGIS)
```sql
-- Tốt: Sử dụng Index và đặt tên rõ ràng
SELECT 
    segment_id, 
    avg_speed 
FROM fact_traffic_flow 
WHERE 
    time_key = 202310251030 
    AND ST_DWithin(geometry, ST_MakePoint(106.7, 10.8)::geography, 500);
