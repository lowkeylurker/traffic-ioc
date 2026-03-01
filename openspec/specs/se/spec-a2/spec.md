# A2 - Incident Monitoring & Alerts (Giám sát & Cảnh báo Sự cố)

| Metadata         | Details                                |
| :--------------- | :------------------------------------- |
| **Status**       | `DRAFT`                                |
| **Owner**        | SE Team                                |
| **Version**      | 1.0.0                                  |
| **Domain**       | IOC / Monitoring                       |
| **Dependencies** | Postgres (PostGIS), A1 (Traffic Layer) |

---

## 1. Context & Problem

Hệ thống cần hiển thị các sự kiện giao thông cụ thể (**Point Data**) xảy ra trên mạng lưới đường bộ. Khác với lớp giao thông (A1) hiển thị vận tốc dòng chảy, A2 tập trung vào các điểm tắc nghẽn cục bộ do nguyên nhân cụ thể (Tai nạn, Ngập lụt, Công trình).
Đây là nguồn thông tin đầu vào để kích hoạt quy trình Tối ưu hóa (A5).

## 2. Goals

1.  **Visualize:** Hiển thị vị trí sự cố chính xác trên bản đồ nền bằng các icon định danh.
2.  **Alert:** Cung cấp danh sách sự cố thời gian thực để Operator nhận biết nhanh.
3.  **Navigate:** Đồng bộ tương tác giữa danh sách cảnh báo và bản đồ (Click list -> Zoom map).

---

## 3. Data Model

### 3.1. Schema: `fact_incidents`

Bảng lưu trữ thông tin sự cố. Sử dụng PostGIS cho dữ liệu không gian.

```sql
CREATE TYPE incident_type AS ENUM ('ACCIDENT', 'FLOOD', 'CONSTRUCTION', 'FIRE', 'OTHER');
CREATE TYPE incident_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE incident_status AS ENUM ('OPEN', 'RESOLVED', 'PENDING');

CREATE TABLE fact_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geom GEOMETRY(POINT, 4326) NOT NULL, -- Tọa độ WGS84
  type incident_type NOT NULL,
  severity incident_severity DEFAULT 'LOW',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status incident_status DEFAULT 'OPEN',
  source VARCHAR(50) DEFAULT 'SENSOR', -- SENSOR, ADMIN, USER_REPORT
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index cho truy vấn không gian
CREATE INDEX idx_incidents_geom ON fact_incidents USING GIST (geom);
-- Index cho lọc trạng thái (thường xuyên query status='OPEN')
CREATE INDEX idx_incidents_status ON fact_incidents (status);
```

### 3.2. Typescript Interface (Frontend)

```typescript
export interface IncidentFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [Lng, Lat]
  };
  properties: {
    id: string;
    type: "ACCIDENT" | "FLOOD" | "CONSTRUCTION" | "FIRE";
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    title: string;
    description: string;
    timestamp: string;
  };
}
```

## 4. API Specifications

### 4.1. Get Active Incidents

Lấy danh sách các sự cố đang diễn ra để hiển thị lên bản đồ.

- Endpoint: `GET /api/v1/incidents`
- Query Parameters:
  - `status`: `OPEN` (Default) | `RESOLVED`
  - `bbox`: `minLng,minLat,maxLng,maxLat` (Optional - Lấy theo khung nhìn bản đồ)
- Response Format: `GeoJSON FeatureCollection`

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [106.701, 10.775] },
      "properties": {
        "id": "inc-001",
        "type": "ACCIDENT",
        "severity": "HIGH",
        "title": "Va chạm xe tải",
        "timestamp": "2026-02-02T08:30:00Z"
      }
    }
  ]
}
```

## 5. UI/UX Specifications

### 5.1. Map Layer (Lớp bản đồ)

- Component: `IncidentLayer`
- Z-Index: Phải đặt `z-index` cao hơn Traffic Layer (A1) để icon không bị đường che khuất.
- Marker Styling:
  - `ACCIDENT`: Icon cảnh báo đỏ (💥).
  - `FLOOD`: Icon sóng nước xanh (🌊).
  - `CONSTRUCTION`: Icon rào chắn vàng (🚧).
- Interactions:
  - Hover: Hiện Tooltip nhỏ (Title + Time).
  - Click: Hiện Popup chi tiết + Nút Action ("Xử lý A5").

### 5.2. Widget (Danh sách cảnh báo)

- Position: Sidebar bên phải hoặc Overlay góc phải trên.
- Sorting: Mới nhất lên đầu (ORDER BY created_at DESC).
- Item Content: Icon loại sự cố | Tiêu đề | Thời gian (Relative time: "5 phút trước").
- Interaction Sync:
  - Khi click vào Item trong danh sách -> Map thực hiện flyTo({ center, zoom: 16 }).
  - Marker tại vị trí đó tự động mở Popup.

## 6. Business Logic

### 6.1. Severity Logic (Quy tắc màu sắc)

Dùng để tô màu viền (Border) của Marker hoặc Background của Item trong danh sách:

- CRITICAL: Màu Đỏ đậm + Hiệu ứng nhấp nháy (Animation Pulse).
- HIGH: Màu Cam.
- MEDIUM: Màu Vàng.
- LOW: Màu Xanh dương.

### 6.2. Data Freshness (Làm mới dữ liệu)

- Strategy: Polling.

- Interval: Gọi API 30 giây/lần.

- Diffing: Chỉ render lại Marker mới hoặc Marker có thay đổi trạng thái, tránh re-render toàn bộ map gây giật.
