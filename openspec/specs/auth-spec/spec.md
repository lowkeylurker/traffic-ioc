# Authentication & RBAC Specification (Clerk Integration)

**Goal:** Tích hợp Clerk Auth vào Monorepo (React FE + Express BE) và áp dụng RBAC (Role-Based Access Control).
**Roles:** `admin` | `user`.
**Strategy:** Sử dụng Clerk `publicMetadata` để lưu trữ role.

---

## 1. Clerk Platform Setup (Manual Steps)

_Thực hiện trên Clerk Dashboard trước khi code._

1.  **Create App:** Tạo ứng dụng mới tên "Traffic IOC".
2.  **Auth Methods:** Bật Email/Password và Google Social Login.
3.  **Customize Session Token:**
    - Vào mục **Sessions** -> **Customize Session Token**.
    - Thêm claim `metadata` vào token JWT để Backend đọc được role mà không cần gọi thêm API.
    - Template:
      ```json
      {
        "role": "{{user.public_metadata.role}}"
      }
      ```
4.  **Set Admin Role:**
    - Tạo một user đầu tiên.
    - Vào User details, mục **Public Metadata**, thêm: `{"role": "admin"}`.
    - Các user đăng ký mới mặc định sẽ không có role (hoặc logic BE sẽ gán là `user`).

---

## 2. Backend Implementation (Node.js/Express)

**Directory:** `./backend`

### 2.1. Dependencies

Cài đặt SDK Clerk cho Node.js:
`npm install @clerk/clerk-sdk-node`

### 2.2. Environment Variables (`.env`)

Thêm vào file `.env`:

```env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### 2.3. Middleware (src/middlewares/auth.middleware.ts)

Tạo middleware để xác thực và phân quyền.

1. `ClerkExpressRequireAuth()`: Middleware có sẵn của Clerk để verify Bearer Token.
2. `requireRole(role: string)`: Custom middleware kiểm tra role.
   - Đọc req.auth.sessionClaims.role (được inject từ bước 1).
   - Nếu role của user không khớp với yêu cầu -> Trả về 403 Forbidden.

### 2.4. Apply to Routes (`src/routes/*.ts`)

Áp dụng bảo vệ cho các Endpoint sau:

- Public Routes (Không cần Auth hoặc chỉ cần User):
  - `GET /api/v1/map/segments` (Ai cũng xem được map).
  - `GET /api/v1/analytics/public-summary` (Thống kê cơ bản).

- Admin Routes (Cần requireRole('admin')):
  - `POST /api/v1/simulation/*` (Chỉ admin được chạy mô phỏng).
  - `POST /api/v1/alerts/*` (Tạo cảnh báo).
  - `GET /api/v1/analytics/detailed-report` (Báo cáo sâu).

## 3. Frontend Implementation (React/Vite)

Directory: ./frontend

### 3.1. Dependencies

`npm install @clerk/clerk-react`

### 3.2. Environment Variables (.env)

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 3.3. App Provider (`src/main.tsx`)

Bọc toàn bộ App bằng `<ClerkProvider>`:

```tsx
<ClerkProvider publishableKey={PUBLISHABLE_KEY}>
  <App />
</ClerkProvider>
```

### 3.4. Layout & Navigation (src/layouts/MainLayout.tsx)

Điều chỉnh Sidebar dựa trên Role:

1. Dùng hook `useUser()` để lấy thông tin user.
2. Kiểm tra: `const isAdmin = user?.publicMetadata?.role === 'admin';`.
3. Render Logic:

- Nếu chưa login: Hiện nút "Sign In".
- Nếu là `user`: Ẩn menu "Mô phỏng & Dự báo", ẩn "Báo cáo chi tiết".
- Nếu là `admin`: Hiện full menu.

### 3.5. Protected Routes (`src/components/auth/RoleGuard.tsx`)

Tạo component bảo vệ Route (Client-side protection):

```tsx
// Logic giả lập
const RoleGuard = ({ children, requiredRole }) => {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return <Loading />;

  const userRole = user?.publicMetadata?.role;

  if (requiredRole === "admin" && userRole !== "admin") {
    return <Navigate to="/unauthorized" />;
  }

  return children;
};
```

### 3.6. UI Components

- Thêm `UserButton` (của Clerk) vào Header để hiển thị Avatar và nút Logout.
- Tạo trang `/sign-in` và `/sign-up` sử dụng component `<SignIn />` và `<SignUp />` của Clerk.

## 4. Workflows

### 4.1. Login Flow

1. User vào web -> Redirect sang trang Login của Clerk.

2. Login thành công -> Redirect về Dashboard.

3. Frontend lưu Token.

### 4.2. Admin Action Flow

1. Admin vào trang "Mô phỏng".

2. Frontend gọi API `POST /simulation`.

3. Gửi kèm Header: `Authorization: Bearer <token>`.
4. Backend check Token hợp lệ + Check Metadata role == "admin".

5. Thành công: Trả về kết quả.

6. Thất bại: Trả về 403.
