// Application Constants

import type { Alert, WeatherData } from '@/types'

// Map Configuration
export const DEFAULT_MAP_CENTER: [number, number] = [106.7009, 10.7769] // [lon, lat] - Sài Gòn
export const DEFAULT_MAP_ZOOM = 14
export const MAP_ZOOM_BOUNDS = { min: 8, max: 18 }

// Colors for LOS grades (Design System)
export const LOS_COLORS: Record<string, string> = {
  A: '#52c41a', // Traffic Fast (Leaf Green)
  B: '#52c41a', // Traffic Fast
  C: '#52c41a', // Traffic Fast
  D: '#faad14', // Traffic Moderate (Golden Yellow)
  E: '#FF6B35', // Traffic Heavy (Red-Orange)
  F: '#ff4d4f', // Traffic Slow (Red)
}

// Traffic Semantic Colors (Design System)
export const TRAFFIC_COLORS = {
  FAST: '#52c41a', // Thông thoáng - LOS A,B,C (>30 km/h)
  MODERATE: '#faad14', // Đông xe vừa phải - LOS D (15-30 km/h)
  HEAVY: '#FF6B35', // Đông xe nặng - LOS E
  SLOW: '#ff4d4f', // Ùn tắc - LOS F (<15 km/h)
  JAM: '#cf1322', // Tê liệt
  INCIDENT: '#722ed1', // Sự cố (Purple)
  NO_DATA: '#d9d9d9', // Không có dữ liệu
}

// API Endpoints
export const API_ENDPOINTS = {
  MAP: {
    SEGMENTS: '/map/segments',
    STATUS: '/map/status',
    STATUS_BY_SEGMENT: (id: number) => `/map/status/${id}`,
  },
  ANALYTICS: {
    VEHICLE_MIX: '/analytics/vehicle-mix',
    SPEED_COMPARISON: '/analytics/speed-comparison',
    RELIABILITY_RANKING: '/analytics/reliability-ranking',
  },
  SIMULATION: {
    FORECAST: '/simulation/forecast',
    ROUTING: '/simulation/routing',
  },
  WEATHER: {
    CURRENT: '/weather/current',
  },
}

// Chart Configuration (Design System)
export const CHART_COLORS = {
  primary: '#1677ff', // Ant Design Blue
  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
  info: '#1677ff',
}

// Layout
export const LAYOUT_SIDER_WIDTH = 200
export const LAYOUT_HEADER_HEIGHT = 64

// Time Formatting
export const DATE_FORMAT = 'DD/MM/YYYY'
export const TIME_FORMAT = 'HH:mm:ss'
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm:ss'

// Polling Intervals
export const POLLING_INTERVALS = {
  TRAFFIC_DATA: 10000, // 10 seconds
  WEATHER_DATA: 900000, // 15 minutes
  ANALYTICS_DATA: 60000, // 1 minute
  ANALYTICS_COMPARISON: 300000, // 5 minutes
}

// Mock data - Alerts
export const MOCK_ALERTS: Alert[] = [
  {
    id: 1,
    segmentId: 1,
    segmentName: 'Đường Lê Lợi',
    incidentType: 'congestion' as const,
    severity: 3,
    description: 'Tắc đường do lượng xe cao',
    timestamp: new Date(Date.now() - 300000),
  },
  {
    id: 2,
    segmentId: 3,
    segmentName: 'Đường Cộng Hòa',
    incidentType: 'accident' as const,
    severity: 4,
    description: 'Tai nạn giao thông 2 chiếc xe',
    timestamp: new Date(Date.now() - 600000),
  },
  {
    id: 3,
    segmentId: 5,
    segmentName: 'Đường Nguyễn Kiếm',
    incidentType: 'roadwork' as const,
    severity: 2,
    description: 'Sửa chữa đường, 2 làn chạy',
    timestamp: new Date(Date.now() - 900000),
  },
]

// Mock data - Weather
export const MOCK_WEATHER: WeatherData = {
  temp_c: 32,
  condition_code: 801,
  condition_text: 'Clouds',
  humidity: 75,
  wind_kph: 8,
  impact_level: 'NONE',
  warning_message: 'Thời tiết ổn định, tầm nhìn tốt.',
  last_updated: new Date().toISOString(),
}
