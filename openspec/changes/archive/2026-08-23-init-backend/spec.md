# Backend Codebase Specification (Prisma Version)

**Target Directory:** `./backend`
**Tech Stack:** Node.js, Express, TypeScript, Prisma ORM, PostgreSQL (PostGIS).

Tài liệu này đặc tả yêu cầu kỹ thuật để khởi tạo mã nguồn cho dịch vụ Backend API sử dụng Prisma.

## 1. Project Initialization & Dependencies

### 1.1. Package.json Configuration
Khởi tạo file `package.json` với các thông tin sau:
- **Name:** `traffic-ioc-backend`
- **Scripts:**
  - `dev`: "nodemon src/server.ts"
  - `build`: "tsc"
  - `start`: "node dist/server.js"
  - `prisma:pull`: "npx prisma db pull" (Hút schema từ DB về)
  - `prisma:gen`: "npx prisma generate" (Tạo TypeScript client)
  - `lint`: "eslint . --ext .ts"
- **Dependencies:**
  - `express`: Framework chính.
  - `cors`: Xử lý CORS.
  - `dotenv`: Quản lý biến môi trường.
  - `helmet`: Bảo mật HTTP headers.
  - `morgan`: Logger.
  - `@prisma/client`: Client ORM chính để query DB.
  - `class-validator` & `class-transformer`: Validate DTO.
- **DevDependencies:**
  - `typescript`
  - `ts-node`
  - `nodemon`
  - `prisma`: CLI tool.
  - `@types/node`, `@types/express`, `@types/cors`, `@types/morgan`.
  - `eslint`, `prettier`.

### 1.2. Configuration Files
- **`tsconfig.json`**:
  - `target`: "ES2020"
  - `module`: "commonjs"
  - `rootDir`: "./src"
  - `outDir`: "./dist"
  - `strict`: true
  - `esModuleInterop`: true
  - `skipLibCheck`: true (Tránh lỗi type nội bộ của Prisma nếu có)

- **`.env`**:
  - `PORT`: 3000
  - `DATABASE_URL`: "postgresql://postgres:password@localhost:5432/traffic_dw?schema=public" (Format chuẩn của Prisma)

## 2. Core Architecture Structure
Cấu trúc thư mục (Lưu ý: Không còn thư mục `entities` vì Prisma quản lý trong `node_modules`):

```text
src/
├── config/             # Cấu hình PrismaClient
├── constants/          # Constants
├── controllers/        # Xử lý Request/Response
├── dtos/               # Input Validation
├── interfaces/         # Custom Interface (nếu cần mở rộng Prisma type)
├── middlewares/        # Error Handler, Logging
├── routes/             # API Routes
├── services/           # Logic nghiệp vụ (Gọi PrismaClient)
├── utils/              # Helper functions
├── app.ts              # Setup Express
└── server.ts           # Entry point
prisma/
└── schema.prisma       # File định nghĩa Schema (Tự động sinh ra)
``` 

## 3. Implementation Details
### 3.1. Database & Prisma Setup
- Introspection Workflow:
  - Vì Database được quản lý bởi Data Engineer (Galaxy Schema), Backend KHÔNG dùng prisma migrate.  
  - Quy trình chuẩn: Chạy npx prisma db pull để cập nhật schema.prisma mỗi khi DB thay đổi.
  - PostGIS Support: Trong schema.prisma, cần bật preview feature postgresqlExtensions và khai báo extension postgis.

- Prisma Configuration (src/config/prisma.ts):
  - Khởi tạo PrismaClient (Singleton Pattern).
  - Export instance prisma để dùng chung toàn app.

### 3.2. Handling PostGIS (Quan trọng)
Prisma hỗ trợ kiểu dữ liệu hình học nhưng thường trả về dạng Binary hoặc Object thô.
- Quy tắc: Với các query cần lấy geometry để vẽ bản đồ (GeoJSON):
  - Sử dụng Raw Queries (prisma.$queryRaw) kết hợp với hàm ST_AsGeoJSON(geometry) của PostGIS.
  - Ví dụ logic trong Service:

```TypeScript
const segments = await prisma.$queryRaw`
  SELECT segment_key, segment_name, ST_AsGeoJSON(geometry)::json as geometry 
  FROM dim_segment
`;
```
### 3.3. Standard Response & Error Handling
Response Format:

```
JSON
{
  "success": true,
  "data": { ... }, 
  "message": "..."
}
```
Error Middleware: Bắt lỗi PrismaClientKnownRequestError (ví dụ: record not found, constraint violation) để trả về status code HTTP tương ứng (404, 400).

## 4. Feature Modules (Boilerplate)
Tạo khung sườn 3 lớp (Controller - Service - Route).

### 4.1. Map Module (/api/v1/map)
Service Logic (MapService):
- getSegments(): Dùng prisma.$queryRaw để lấy GeoJSON từ bảng dim_segment.
- getTrafficStatus(): Dùng prisma.factTrafficFlow.findMany() kèm include (hoặc join raw) để lấy vận tốc và LOS.

### 4.2. Analytics Module (/api/v1/analytics)
Service Logic (AnalyticsService):

- getVehicleMix(): Dùng prisma.factTrafficFlow.groupBy để tính tổng hợp total_pcu hoặc query bảng Dim liên quan.

- getReliability(): Query bảng Ranking (nếu có) hoặc tính toán đơn giản.

### 4.3. Simulation Module (/api/v1/simulation)
Service Logic (SimulationService):

- Trả về Mock Data cho forecast và routing.

- Lưu ý: Routing thật sau này sẽ dùng pgRouting, lúc đó cũng sẽ cần dùng prisma.$queryRaw để gọi function SQL.

## 5. Coding Conventions
- Variable Naming: camelCase.

- Prisma Models: Tên model trong schema.prisma sẽ được auto-generated dựa trên tên bảng DB (thường là snake_case hoặc map sang PascalCase tùy cấu hình introspection). Backend code nên map về camelCase khi trả ra API.

- DTO: Sử dụng class-validator (@IsString, @IsInt) cho các Body/Query params.
