# Frontend Codebase Specification

**Target Directory:** `./frontend`
**Tech Stack:** React 18, Vite, TypeScript, Ant Design, Mapbox GL JS, Chart.js.

Tài liệu này đặc tả yêu cầu kỹ thuật để khởi tạo mã nguồn cho ứng dụng Web Frontend. Hãy thực hiện tuần tự các bước sau.

## 1. Project Initialization & Dependencies

### 1.1. Package.json Configuration
Khởi tạo file `package.json` với các thông tin sau:
- **Name:** `traffic-ioc-frontend`
- **Scripts:**
  - `dev`: "vite"
  - `build`: "tsc && vite build"
  - `preview`: "vite preview"
  - `lint`: "eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
- **Dependencies:**
  - `react`, `react-dom`: Core library.
  - `react-router-dom`: Quản lý Routing.
  - `antd`: UI Component Library chính (Layout, Button, Input, Table...).
  - `@ant-design/icons`: Icon set của Ant Design.
  - `axios`: HTTP Client để gọi API Backend.
  - `react-map-gl`, `mapbox-gl`: Thư viện hiển thị bản đồ.
  - `chart.js`, `react-chartjs-2`: Thư viện vẽ biểu đồ.
  - `zustand`: Quản lý State đơn giản (Global state).
  - `dayjs`: Xử lý thời gian (thay thế Moment.js).
  - `lucide-react`: Bộ icon bổ trợ (nhẹ hơn Ant Icons cho một số trường hợp).
- **DevDependencies:**
  - `vite`: Build tool.
  - `typescript`: Ngôn ngữ chính.
  - `@types/node`, `@types/react`, `@types/react-dom`.
  - `@vitejs/plugin-react`: Plugin React cho Vite.

### 1.2. Configuration Files
- **`vite.config.ts`**:
  - Port: `5173`
  - Resolve alias: `@` trỏ tới `./src`.
- **`tsconfig.json`**:
  - Config chuẩn cho React + Vite.
  - `compilerOptions.baseUrl`: "."
  - `compilerOptions.paths`: `{"@/*": ["src/*"]}`.
- **`.env`** (Tạo mẫu):
  - `VITE_API_BASE_URL`: `http://localhost:3000/api/v1`
  - `VITE_MAPBOX_TOKEN`: (Placeholder string)

## 2. Core Architecture Structure
Tạo cấu trúc thư mục trong `src/` theo hướng Feature-based kết hợp Layered:

```text
src/
├── assets/             # Images, Global CSS, Fonts
├── components/         # Reusable Components
│   ├── common/         # Button, Loading, ErrorState chung
│   ├── layout/         # Header, Sidebar
│   ├── map/            # TrafficMap, HeatmapLayer, Markers
│   ├── charts/         # LineChart, DonutChart wrappers
│   └── widgets/        # WeatherWidget, AlertFeed
├── config/             # App Constants, Theme config
├── hooks/              # Custom Hooks (useTrafficData, useMapLayers)
├── layouts/            # Layout Templates (MainLayout)
├── pages/              # Page Components (trùng với 3 modules chính)
├── services/           # API integration (Axios instances)
├── stores/             # Zustand Stores (useAppStore)
├── types/              # TypeScript Interfaces/Types
├── utils/              # Helper functions (format date, format currency)
├── App.tsx             # Root Component + Routing
└── main.tsx            # Entry Point
```
## 3. Implementation Details
### 3.1. Global Styles & Theme (src/main.tsx)
- Import CSS của Ant Design (nếu cần config theme) hoặc để mặc định.

- QUAN TRỌNG: Import CSS của Mapbox: import 'mapbox-gl/dist/mapbox-gl.css';.

- Config ConfigProvider của Ant Design để set màu chủ đạo (Primary Color: #1890ff - Xanh Giao thông).

### 3.2. Routing & Layout (src/layouts/MainLayout.tsx)
- Sử dụng Layout component của Ant Design:

  - Sider: Collapsible, chứa Menu điều hướng tới 3 trang chính.

  - Header: Hiển thị Logo "Traffic IOC" và User Info giả lập.

  - Content: Chứa <Outlet /> để render các trang con.

- Menu Items:

  - Giám sát Vận hành (/real-time) - Icon: EyeOutlined

  - Phân tích & Thống kê (/analytics) - Icon: BarChartOutlined

  - Mô phỏng & Dự báo (/simulation) - Icon: ExperimentOutlined
### 3.3. API Service (src/services/api.ts)
- Tạo axiosInstance với baseURL lấy từ import.meta.env.VITE_API_BASE_URL.

- Thêm interceptors để xử lý lỗi chung (ví dụ: in log khi API lỗi 500).

- Định nghĩa các hàm gọi API mẫu (trả về Promise):

  - mapApi.getSegments()

  - analyticsApi.getStats()

  - simulationApi.runForecast()
## 4. Feature Specifications (Page Scaffolding)
Tạo khung UI cho 3 trang chức năng. Nếu chưa có dữ liệu thật, hãy tạo Mock Data ngay trong file component để UI hiển thị được.

### 4.1. Page 1: Real-Time Operations (src/pages/RealTimePage.tsx)
- Layout: Fullscreen relative container.

- Components:

  - Map Container: Chiếm 100% width/height (z-index: 0).

  - Overlays (z-index: 10):

    - WeatherWidget: Góc trên trái. Hiển thị icon Mưa/Nắng + Text cảnh báo.

    - AlertFeed: Sidebar phụ bên phải hoặc Widget trôi. Dùng List của AntD, scrollable.
- Mock Data: Tạo một mảng alerts giả (VD: "Tắc đường tại Ngã tư Hàng Xanh").

### 4.2. Page 2: Strategic Analytics (src/pages/AnalyticsPage.tsx)
- Layout: Grid System (Row, Col của AntD).

- Filter Bar: Một Card ở trên cùng chứa: Select (Quận), Select (Tên đường), RangePicker (Ngày).

- Components:
  - A3 Chart: Line chart (react-chartjs-2). Dataset 1: Hôm nay, Dataset 2: Trung bình.

  - A9 Chart: Doughnut chart. Labels: Xe máy, Ô tô, Xe buýt.

  - A4 Table: Table (AntD). Columns: Tên đường, Buffer Index, Trạng thái. 
  - A5 Map: Một Map container nhỏ hiển thị Heatmap tĩnh.

### 4.3. Page 3: Simulation & Forecast (src/pages/SimulationPage.tsx)
- Layout: Split Pane (Flexbox).

  - Left Pane (70%): Bản đồ tác nghiệp.

  - Right Pane (30%): Panel điều khiển.

- Interaction:
Tạo placeholder cho sự kiện "Right Click" trên bản đồ (Context Menu: "Giả lập chặn đường").

- Components:

  - B1 Chart: Line chart (Area fill). X-axis: Thời gian tương lai (next 60 mins).

  - Result Panel: Khu vực hiển thị kết quả text ("Lộ trình thay thế: Đi qua đường ABC..."). 
## 5. Coding Conventions
- Naming:

  - Components: PascalCase (e.g., TrafficMap.tsx).

  Hooks: camelCase bắt đầu bằng use (e.g., useTrafficData.ts).

- Constants: UPPER_SNAKE_CASE (e.g., DEFAULT_MAP_ZOOM).

- Styling:

  -  Sử dụng Inline Style cho layout nhanh hoặc CSS Module nếu cần phức tạp.

  -  Ưu tiên sử dụng các utility props của Ant Design (như gutter, space).
-  Types: Luôn define Interface cho Props của Component (e.g., interface TrafficMapProps { ... }).
