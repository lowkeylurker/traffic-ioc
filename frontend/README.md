# Smart Traffic IOC - Frontend

Ứng dụng React với Vite cho hệ thống Điều hành Giao thông Thông minh (Smart Traffic Integrated Operations Center).

## 📋 Yêu cầu

- Node.js 18+
- npm hoặc yarn

## 🚀 Cài đặt

1. **Cài đặt dependencies:**
   ```bash
   npm install
   ```

2. **Cấu hình biến môi trường:**
   
   Sao chép `.env` và cập nhật giá trị:
   ```bash
   cp .env.example .env
   ```

   Nội dung `.env`:
   ```
   VITE_API_BASE_URL=http://localhost:3000/api/v1
   VITE_MAPBOX_TOKEN=your_mapbox_token_here
   ```

3. **Chạy development server:**
   ```bash
   npm run dev
   ```
   Ứng dụng sẽ chạy tại `http://localhost:5173`

## 📦 Scripts

- `npm run dev` - Chạy development server
- `npm run build` - Build cho production
- `npm run preview` - Xem preview build
- `npm run lint` - Chạy ESLint

## 📁 Cấu trúc Thư mục

```
frontend/
├── src/
│   ├── assets/              # Hình ảnh, font, tài nguyên tĩnh
│   ├── components/          # React components
│   │   ├── common/         # Loading, ErrorState, EmptyState
│   │   ├── widgets/        # WeatherWidget, AlertFeed
│   │   ├── map/            # TrafficMap component
│   │   └── charts/         # Chart components
│   ├── config/             # Cấu hình ứng dụng
│   │   ├── constants.ts    # Hằng số
│   │   └── theme.ts        # Ant Design theme
│   ├── hooks/              # Custom React hooks
│   │   └── useTraffic.ts   # Data fetching hooks
│   ├── layouts/            # Layout components
│   │   └── MainLayout.tsx  # Main application layout
│   ├── pages/              # Page components
│   │   ├── RealTimePage.tsx
│   │   ├── AnalyticsPage.tsx
│   │   └── SimulationPage.tsx
│   ├── services/           # API services
│   │   └── api.ts          # Axios instance
│   ├── stores/             # Zustand stores
│   │   └── useAppStore.ts  # Global state
│   ├── styles/             # Global CSS
│   ├── types/              # TypeScript types
│   │   └── index.ts        # Interfaces
│   ├── utils/              # Utility functions
│   │   └── format.ts       # Formatting helpers
│   ├── App.tsx             # Root component
│   ├── main.tsx            # Entry point
│   └── vite-env.d.ts       # Vite env types
├── index.html              # HTML entry
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md

```

## 🎨 Công nghệ

- **React 18** - UI library
- **Vite 5** - Build tool
- **TypeScript 5.3** - Type safety
- **Ant Design 5** - UI components
- **Mapbox GL JS** - Interactive maps
- **Chart.js** - Data visualization
- **Zustand** - State management
- **Axios** - HTTP client
- **dayjs** - Date formatting

## 🔌 API Integration

Frontend kết nối đến backend API tại `http://localhost:3000/api/v1` với 3 module chính:

### Map Module (`/map`)
- `GET /segments` - Lấy danh sách đoạn đường
- `GET /status` - Lấy trạng thái giao thông toàn bộ
- `GET /status/:id` - Lấy trạng thái đoạn đường cụ thể

### Analytics Module (`/analytics`)
- `GET /vehicle-mix` - Tỷ lệ phương tiện
- `GET /speed-comparison` - So sánh tốc độ
- `GET /reliability-ranking` - Bảng xếp hạng độ đáng tin cậy

### Simulation Module (`/simulation`)
- `POST /forecast` - Dự báo tốc độ (B1)
- `POST /routing` - Tính toán lộ trình thay thế

## 🎯 Pages

### 1. Giám sát Vận hành (`/real-time`)
- Fullscreen interactive map với Mapbox GL
- Overlay: WeatherWidget (top-left), AlertFeed (right)
- Real-time traffic visualization với LOS-based coloring
- Tự động cập nhật dữ liệu mỗi 10 giây

### 2. Phân tích & Thống kê (`/analytics`)
- Filter bar: quận, đường, date range
- A3: So sánh tốc độ (Line chart)
- A9: Tỷ lệ phương tiện (Doughnut chart)
- A4: Bảng xếp hạng độ đáng tin cậy
- A5: Heatmap trên bản đồ

### 3. Mô phỏng & Dự báo (`/simulation`)
- Split layout: 70% map, 30% control panel
- B1: Dự báo tốc độ 60 phút tới
- Input: Chọn đoạn đường, chọn chặn đường
- Output: Kết quả dự báo, lộ trình thay thế

## 🌡️ Trạng thái Giao thông (LOS)

| Grade | Màu   | Tốc độ     | Mô tả    |
|-------|-------|-----------|----------|
| A     | 🟢 Xanh | >55 km/h  | Rất tốt  |
| B     | 🟢 Xanh nhạt | 45-55  | Tốt      |
| C     | 🟡 Vàng | 35-45    | Trung bình |
| D     | 🟠 Cam | 25-35     | Tệ       |
| E     | 🔴 Đỏ | 15-25     | Rất tệ   |
| F     | 🟣 Tím | <15       | Tắc nghẽn |

## 📊 State Management

Dùng Zustand với store `useAppStore`:
```typescript
{
  segments: Segment[];
  trafficStatus: TrafficStatus[];
  alerts: Alert[];
  selectedSegmentId: number | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setSegments(segments);
  setTrafficStatus(status);
  setAlerts(alerts);
  selectSegment(id);
  setLoading(loading);
  setError(error);
  reset();
}
```

## 🔄 Data Fetching

Custom hooks tự động fetch dữ liệu từ API:
- `useSegments()` - Fetch segments on mount
- `useTrafficStatus()` - Fetch + polling every 10s
- `useAnalytics()` - Parallel fetch của 3 endpoints

## 🗺️ Mapbox Configuration

1. Lấy Mapbox access token từ https://mapbox.com
2. Set trong `.env`:
   ```
   VITE_MAPBOX_TOKEN=pk.eyJ...
   ```

## 🌐 Localization

Ứng dụng sử dụng tiếng Việt, cấu hình Ant Design locale:
```tsx
<ConfigProvider locale={viVN}>
  <App />
</ConfigProvider>
```

## 📝 Naming Conventions

- **Components**: PascalCase (`TrafficMap.tsx`)
- **Hooks**: camelCase, prefix `use` (`useTraffic.ts`)
- **Utilities**: camelCase (`formatDate()`)
- **Types**: PascalCase (`TrafficStatus`)
- **Files**: kebab-case cho non-component files, PascalCase cho components
- **Folders**: lowercase, multi-word khi cần (`components/widgets`)

## 🛡️ Environment Variables

Tất cả sensitive data phải được lưu trong `.env`:
- ❌ Không commit `.env` (đã được add vào `.gitignore`)
- ✅ Commit `.env.example` với template
- ⚠️ Frontend chỉ có thể access `VITE_*` variables

## 🚀 Deployment

### Build cho production:
```bash
npm run build
```

Output trong `dist/` folder sẵn sàng deploy.

### Environment variables cho production:
```
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
VITE_MAPBOX_TOKEN=pk.eyJ...
```

## 📞 Support & Troubleshooting

### Frontend không kết nối Backend
- Kiểm tra Backend đang chạy tại `localhost:3000`
- Kiểm tra `VITE_API_BASE_URL` trong `.env`
- Kiểm tra CORS settings trong Backend

### Mapbox map không hiển thị
- Kiểm tra `VITE_MAPBOX_TOKEN` hợp lệ
- Kiểm tra GeoJSON data từ API

### Ant Design styles không tải
- Kiểm tra Ant Design đã được cài: `npm install antd`
- Import `mapbox-gl/dist/mapbox-gl.css` trong TrafficMap

## 📄 License

MIT
