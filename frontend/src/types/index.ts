// Core Traffic Data Types

export interface Segment {
  segmentId: number
  segmentName: string
  geometry: GeoJSON.LineString
  numLanes: number
  speedLimit: number
}

export interface TrafficStatus {
  segmentId: number
  segmentName: string
  currentSpeed: number
  avgSpeed: number
  losGrade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  losScore: number
  pcuValue: number
  occupancyRate: number
  timestamp: Date
}

export interface Alert {
  id: number
  segmentId: number
  segmentName: string
  incidentType: 'accident' | 'congestion' | 'roadwork' | 'weather'
  severity: 1 | 2 | 3 | 4 | 5
  description: string
  timestamp: Date
}

export interface WeatherData {
  temperature: number
  condition: string
  humidity: number
  windSpeed: number
  rainfall: number
}

export interface VehicleMixData {
  category: string
  count: number
  percentage: number
}

export interface SpeedComparisonData {
  segmentId: number
  segmentName: string
  currentSpeed: number
  baselineSpeed: number
  speedRatio: number
}

export interface ReliabilityRankData {
  segmentId: number
  segmentName: string
  currentSpeed: number
  baselineSpeed: number
  bufferIndex: number
}

export interface ForecastData {
  segmentId: number
  predictedSpeed: number
  predictedLos: string
  confidenceScore: number
  forecastTime: Date
}

export interface RoutingData {
  route: GeoJSON.LineString
  totalDistance: number
  estimatedTime: number
}

export interface ApiResponse<T> {
  success: boolean
  statusCode: number
  message: string
  data?: T
  error?: {
    code?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any
  }
  timestamp: string
}
