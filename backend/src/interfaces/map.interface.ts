// Map Module Interfaces

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
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

export interface TrafficMapResponse {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// Color Rules
export const COLOR_RULES = {
  RED: '#FF4D4F', // Vận tốc < 15 km/h (Tắc nghẽn/Ùn ứ)
  ORANGE: '#FAAD14', // Vận tốc 15 - 30 km/h (Đông xe/Chậm)
  GREEN: '#52C41A', // Vận tốc > 30 km/h (Thông thoáng)
  GREY: '#D9D9D9', // Không có dữ liệu
} as const;

export type ColorCode = (typeof COLOR_RULES)[keyof typeof COLOR_RULES];
