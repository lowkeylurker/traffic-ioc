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
    isCorridor?: boolean;
    avgSpeed?: number; // Optional cho bản đồ tĩnh
    losIndex?: string;
    color?: string | null;
    lastUpdated?: string;
  };
}

export interface TrafficMapResponse {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// Color Rules
export const COLOR_RULES = {
  GREEN: '#52C41A',      // LOS A - Thông thoáng
  LIGHT_GREEN: '#B7EB8F', // LOS B - Khá thông thoáng
  YELLOW: '#FADB14',     // LOS C - Trung bình
  ORANGE: '#FA8C16',     // LOS D - Mật độ cao
  RED: '#F5222D',        // LOS E - Đông xe
  DARK_RED: '#820014',   // LOS F - Ùn tắc nghiêm trọng
  GREY: '#D9D9D9',       // Không có dữ liệu
} as const;

export type ColorCode = (typeof COLOR_RULES)[keyof typeof COLOR_RULES];
