// Application Constants

// Map Configuration
export const DEFAULT_MAP_CENTER: [number, number] = [106.7009, 10.7769] // [lon, lat] - Sài Gòn
export const DEFAULT_MAP_ZOOM = 12
export const MAP_ZOOM_BOUNDS = { min: 8, max: 18 }

// Colors for LOS grades
export const LOS_COLORS: Record<string, string> = {
  A: '#52c41a', // Green
  B: '#85ce61', // Light green
  C: '#faad14', // Yellow
  D: '#ff7a45', // Orange
  E: '#f5222d', // Red
  F: '#722ed1', // Purple
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
}

// Chart Configuration
export const CHART_COLORS = {
  primary: '#1890ff',
  success: '#52c41a',
  warning: '#faad14',
  error: '#f5222d',
  info: '#1890ff',
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
  WEATHER_DATA: 300000, // 5 minutes
  ANALYTICS_DATA: 60000, // 1 minute
}

// Mock data - Alerts
export const MOCK_ALERTS = [
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
  temperature: 32,
  condition: 'Partly Cloudy',
  humidity: 75,
  windSpeed: 8,
  rainfall: 2,
}
