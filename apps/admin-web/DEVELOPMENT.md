# Hướng dẫn Phát triển Frontend

## 🔧 Setup Development Environment

### 1. Cài đặt dependencies
```bash
cd frontend
npm install
```

### 2. Cấu hình environment
```bash
cp .env.example .env
```

Cập nhật `.env`:
```
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_MAPBOX_TOKEN=pk.eyJ1IjoieW91ci11c2VybmFtZSIsImEiOiJjbHl4eHh4eHgifQ.xxxxxxxxxxxx
```

### 3. Chạy dev server
```bash
npm run dev
```

Mở browser: `http://localhost:5173`

## 📝 Coding Standards

Tuân thủ [AGENTS.md](../openspec/specs/AGENTS.md) conventions.

### Naming Conventions

**Components (PascalCase)**
```tsx
// ✅ Đúng
export const TrafficMap: React.FC<Props> = () => { }

// ❌ Sai
export const trafficMap = () => { }
```

**Hooks (camelCase với prefix `use`)**
```tsx
// ✅ Đúng
export const useTraffic = () => { }

// ❌ Sai
export const TrafficHook = () => { }
```

**Utilities (camelCase)**
```tsx
// ✅ Đúng
export const formatDate = (date: Date) => { }

// ❌ Sai
export const FormatDate = (date: Date) => { }
```

**Types & Interfaces (PascalCase)**
```tsx
// ✅ Đúng
interface TrafficStatus { }
type SegmentId = number

// ❌ Sai
interface traffic_status { }
type segment_id = number
```

**Files & Folders**
```
✅ Correct:
  src/components/TrafficMap.tsx
  src/hooks/useTraffic.ts
  src/pages/RealTimePage.tsx
  src/utils/format.ts
  src/types/index.ts

❌ Wrong:
  src/components/traffic-map.tsx
  src/hooks/traffic.ts
  src/pages/realTimePage.tsx
```

### Code Style

- Sử dụng **Prettier** cho formatting
- Sử dụng **ESLint** cho linting
- Tuân thủ TypeScript **strict mode**
- Không dùng `any`, dùng `unknown` hoặc type hợp lệ

```bash
# Format code
npm run lint

# Fix auto-fixable linting issues
npx eslint src --fix
```

## 📦 Architecture

### Folder Structure
```
src/
├── components/        # React components (UI building blocks)
├── config/           # Configuration (constants, theme)
├── hooks/            # Custom React hooks (logic reuse)
├── layouts/          # Layout components (page structure)
├── pages/            # Page components (route handlers)
├── services/         # API services (backend communication)
├── stores/           # State management (Zustand stores)
├── styles/           # Global CSS styles
├── types/            # TypeScript interfaces
├── utils/            # Utility functions (helpers)
└── assets/           # Static resources
```

### Data Flow

```
Pages (RealTimePage)
    ↓
Hooks (useTraffic)
    ↓
API Services (mapApi)
    ↓
Backend API (http://localhost:3000)
    ↓
Zustand Store (useAppStore)
    ↓
Components (TrafficMap)
```

### Component Hierarchy

```
App.tsx
├── MainLayout
│   ├── Sider (Menu)
│   ├── Header
│   └── Content (<Outlet>)
│       ├── RealTimePage
│       │   ├── TrafficMap
│       │   ├── WeatherWidget
│       │   └── AlertFeed
│       ├── AnalyticsPage
│       │   ├── LineChart
│       │   ├── DoughnutChart
│       │   ├── Table
│       │   └── TrafficMap
│       └── SimulationPage
│           ├── TrafficMap
│           ├── LineChart
│           └── Control Panel
```

## 🔄 State Management

Dùng **Zustand** cho global state:

```tsx
// Using store
import { useAppStore } from '@/stores/useAppStore'

const MyComponent = () => {
  const { segments, setSegments } = useAppStore()
  
  return <div>{segments.length}</div>
}
```

**Store structure:**
```tsx
{
  // State
  segments: Segment[]
  trafficStatus: TrafficStatus[]
  alerts: Alert[]
  selectedSegmentId: number | null
  isLoading: boolean
  error: string | null

  // Actions
  setSegments(segments)
  setTrafficStatus(status)
  setAlerts(alerts)
  selectSegment(id)
  setLoading(loading)
  setError(error)
  reset()
}
```

## 🌐 API Integration

### Service Layer (src/services/api.ts)

```tsx
import { mapApi, analyticsApi, simulationApi } from '@/services/api'

// Usage
const segments = await mapApi.getSegments()
const vehicleMix = await analyticsApi.getVehicleMix()
const forecast = await simulationApi.runForecast(segmentId, 60)
```

### Error Handling

```tsx
const useTraffic = () => {
  try {
    const data = await mapApi.getSegments()
    useAppStore.setSegments(data)
  } catch (error) {
    useAppStore.setError('Failed to fetch segments')
    console.error(error)
  }
}
```

## 🧪 Testing

### Run ESLint
```bash
npm run lint
```

### Type Checking
```bash
npx tsc --noEmit
```

## 🚀 Building & Deployment

### Development Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Environment Variables
```bash
# Production
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
VITE_MAPBOX_TOKEN=pk.eyJ...
```

## 📚 Component Development

### Creating a New Component

1. **Create component file with proper structure:**

```tsx
// src/components/myfeature/MyComponent.tsx
import React from 'react'
import { Card } from 'antd'

interface MyComponentProps {
  title: string
  loading?: boolean
}

export const MyComponent: React.FC<MyComponentProps> = ({ title, loading = false }) => {
  return (
    <Card title={title} loading={loading}>
      {/* Content */}
    </Card>
  )
}
```

2. **Export from index file:**

```tsx
// src/components/myfeature/index.ts
export { MyComponent } from './MyComponent'
```

3. **Use in pages:**

```tsx
import { MyComponent } from '@/components/myfeature'

export const MyPage = () => (
  <MyComponent title="My Title" />
)
```

### Component Props Pattern

```tsx
interface ComponentProps {
  // Required props
  data: Data[]
  
  // Optional props with defaults
  title?: string
  loading?: boolean
  
  // Event handlers
  onSelect?: (id: number) => void
  
  // Styling
  style?: React.CSSProperties
  className?: string
}

export const Component: React.FC<ComponentProps> = ({
  data,
  title = 'Default',
  loading = false,
  onSelect,
  style,
  className,
}) => {
  // Component logic
}
```

## 🐛 Debugging

### Browser DevTools
- React DevTools: Inspect component hierarchy
- Redux DevTools: Monitor Zustand store (via browser extension)
- Network tab: Monitor API calls

### Logging
```tsx
// Available in api.ts response interceptor
console.error('API Error:', error)
```

### Type Errors
```bash
# Find TypeScript errors
npx tsc --noEmit
```

## 📖 Useful Resources

- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [Ant Design Components](https://ant.design/components/overview)
- [Mapbox GL JS API](https://docs.mapbox.com/mapbox-gl-js)
- [Chart.js Documentation](https://www.chartjs.org)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [Vite Guide](https://vitejs.dev/guide)

## 🆘 Common Issues

### Mapbox Token Not Valid
```
Error: Invalid Mapbox token
```
**Solution:** Update `VITE_MAPBOX_TOKEN` in `.env`

### API Base URL Not Correct
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```
**Solution:** Ensure Backend is running at `localhost:3000`

### TypeScript Errors
```
Error: Property 'xxx' does not exist
```
**Solution:** Check types in `src/types/index.ts` match API responses

### Styling Not Applied
```
Ant Design styles not loading
```
**Solution:** Ensure `import 'mapbox-gl/dist/mapbox-gl.css'` in TrafficMap

## 💡 Best Practices

1. **Keep components small & focused**
   - Một component = một trách nhiệm

2. **Use TypeScript strictly**
   - Tránh `any`, dùng proper types

3. **Avoid prop drilling**
   - Dùng Zustand store cho shared state

4. **Memoize expensive computations**
   ```tsx
   const chartData = useMemo(() => {
     // Tính toán phức tạp
   }, [dependencies])
   ```

5. **Handle loading & error states**
   ```tsx
   if (loading) return <Loading />
   if (error) return <ErrorState message={error} />
   return <Content />
   ```

6. **Use custom hooks for logic reuse**
   ```tsx
   const { data, loading, error } = useTraffic()
   ```

7. **Document complex functions**
   ```tsx
   /**
    * Tính toán LOS dựa vào tốc độ
    * @param speed - Tốc độ (km/h)
    * @returns Level of Service (A-F)
    */
   const calculateLOS = (speed: number): string => { }
   ```

## 📞 Getting Help

1. Check [AGENTS.md](../openspec/specs/AGENTS.md) for conventions
2. Review [project.md](../openspec/specs/project.md) for specs
3. Check existing components for examples
4. Search error messages in browser console
5. Check Network tab in DevTools for API issues
