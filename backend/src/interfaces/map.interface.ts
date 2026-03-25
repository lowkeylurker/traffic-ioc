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
    roadKey?: string;
    roadName?: string;
    avgSpeed: number; // Đơn vị: km/h
    losIndex: string; // Mức độ phục vụ: 'A' -> 'F'
    color: string | null; // Mã màu Hex (#FF0000, #00FF00...)
    lastUpdated: string; // ISO Date String
  };
}

export interface TrafficMapResponse {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// Color Rules
export const COLOR_RULES = {
  RED: '#FF4D4F', // LOS F - Ùn tắc
  RED_ORANGE: '#FF6B35', // LOS E - Đông xe
  ORANGE: '#FAAD14', // LOS D - Gần tắc
  GREEN: '#52C41A', // LOS A,B,C - Thông thoáng
  GREY: '#D9D9D9', // Không có dữ liệu
} as const;

export type ColorCode = (typeof COLOR_RULES)[keyof typeof COLOR_RULES];
