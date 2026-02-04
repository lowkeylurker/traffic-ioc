# Spec A1: Network Speed Monitoring Implementation

**Feature:** A1 - Giám sát Tốc độ Mạng lưới (Real-time Traffic Map)  
**Role:** Backend (SE1) & Frontend (SE2)  
**Context:** Hiển thị bản đồ giao thông thời gian thực, tô màu các đoạn đường dựa trên vận tốc xe chạy

---

## 1. Backend Implementation (Node.js/Express)

### 1.1. Data Models (Entities/Interfaces)

**File:** `backend/src/modules/map/map.interface.ts`

Backend cần định nghĩa Interface để chuẩn hóa dữ liệu trả về cho Frontend (GeoJSON format).

```typescript
// Interface cho từng Feature (Đoạn đường) trong GeoJSON
export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: number[][]; // Mảng tọa độ [long, lat]
  };
  properties: {
    segmentId: number;
    segmentName: string;
    avgSpeed: number; // Đơn vị: km/h
    losIndex: string; // Mức độ phục vụ: 'A' -> 'F'
    color: string; // Mã màu Hex (#FF0000, #00FF00...)
    lastUpdated: string; // ISO Date String
  };
}

// Interface trả về trọn vẹn của API (GeoJSON Collection)
export interface TrafficMapResponse {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}
```

### 1.2. Service Layer (Logic)

**File:** `backend/src/modules/map/map.service.ts`

Nhiệm vụ chính:

- Truy vấn Database (hoặc dùng Mock Data)
- Thực hiện logic tô màu (Color Coding) dựa trên vận tốc
- Chuyển đổi dữ liệu sang định dạng GeoJSON chuẩn

#### Quy tắc Tô màu (Color Rules)

- **RED** (`#FF4D4F`): Vận tốc < 15 km/h (Tắc nghẽn/Ùn ứ)
- **ORANGE** (`#FAAD14`): Vận tốc 15 - 30 km/h (Đông xe/Chậm)
- **GREEN** (`#52C41A`): Vận tốc > 30 km/h (Thông thoáng)
- **GREY** (`#D9D9D9`): Không có dữ liệu

#### Query Database (PostGIS Pattern)

> Lưu ý: Logic này dùng khi đã kết nối DB thật.

```sql
SELECT
  s.segment_id,
  s.segment_name,
  ST_AsGeoJSON(s.geometry) as geometry,
  f.avg_speed_kmh,
  f.los_index,
  f.time_key
FROM dim_segment s
LEFT JOIN fact_traffic_flow f ON s.segment_id = f.segment_key
WHERE f.time_key = (SELECT MAX(time_key) FROM fact_traffic_flow)
```

### 1.3. Controller Layer (API Endpoint)

**File:** `backend/src/modules/map/map.controller.ts`

- **Endpoint:** `/api/v1/map/segments`
- **Method:** `GET`
- **Response Type:** `TrafficMapResponse`
- **Error Handling:** Trả về HTTP 500 nếu có lỗi server

### 1.4. Mock Data Strategy (BẮT BUỘC CHO TUẦN 1)

Service cần có biến `USE_MOCK_DATA = true`. Khi biến này bật, trả về dữ liệu cứng sau (Tọa độ Quận 1, TP.HCM):

#### Đường Lê Duẩn (Xanh)

- **Coords:** `[[106.699, 10.780], [106.700, 10.785]]`
- **Speed:** `45` km/h
- **Color:** `#52C41A`

#### Đường Pasteur (Đỏ)

- **Coords:** `[[106.695, 10.782], [106.702, 10.778]]`
- **Speed:** `10` km/h
- **Color:** `#FF4D4F`

#### Đường Hai Bà Trưng (Cam)

- **Coords:** `[[106.697, 10.788], [106.705, 10.785]]`
- **Speed:** `25` km/h
- **Color:** `#FAAD14`

---

## 2. Frontend Implementation (React/Vite)

### 2.1. Dependencies

- `react-map-gl`: Wrapper component cho Mapbox
- `mapbox-gl`: Thư viện lõi
- `axios`: HTTP Client

### 2.2. Map Component Structure

**File:** `frontend/src/components/map/TrafficMap.tsx`

#### Viewport mặc định (TP.HCM)

```typescript
const INITIAL_VIEW_STATE = {
  latitude: 10.7769,
  longitude: 106.7009,
  zoom: 14,
};
```

#### Layer Style (Mapbox Style Spec)

```typescript
const trafficLayerStyle = {
  id: "traffic-flow-layer",
  type: "line",
  paint: {
    "line-width": 5,
    "line-color": ["get", "color"], // Lấy màu từ property 'color' của GeoJSON
    "line-opacity": 0.8,
    "line-blur": 1,
  },
};
```

### 2.3. Data Fetching & Logic

- **State:** `const [trafficData, setTrafficData] = useState(null);`
- **Effect:** Gọi API `GET /api/v1/map/segments` khi mount
- **Auto-refresh:** Dùng `setInterval` (30s) để cập nhật dữ liệu

#### Render

```typescript
<Map
  initialViewState={INITIAL_VIEW_STATE}
  style={{width: '100%', height: '100%'}}
  mapStyle="mapbox://styles/mapbox/dark-v11" // Dark mode
  mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
>
  {trafficData && (
    <Source id="traffic-source" type="geojson" data={trafficData}>
      <Layer {...trafficLayerStyle} />
    </Source>
  )}
</Map>
```

---

## 3. Integration Steps

1. **Backend:** Implement `MapService` trả về Mock Data → Test bằng Postman
2. **Frontend:** Implement `TrafficMap` component, cấu hình Token Mapbox → Test hiển thị trên trình duyệt
3. **Database (Future):** Data Engineer nạp dữ liệu thật → Backend switch sang query SQL thật
