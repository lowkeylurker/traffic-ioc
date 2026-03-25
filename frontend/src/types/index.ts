// Core Traffic Data Types

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: {
    type: 'LineString'
    coordinates: number[][]
  }
  properties: {
    segmentId: number
    segmentName: string
    avgSpeed: number
    losIndex: string
    color: string
    lastUpdated: string
  }
}

export type SegmentResponse = {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

export interface LegacyIncidentFeature {
  type: 'Feature'
  id: number
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: LegacyIncidentProperties
}

export interface LegacyIncidentProperties {
  id: number
  type: string
  severity: string
  description: string
  status: string
  createdAt: string
}

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

// Incident Monitoring Types (A2)
export type IncidentType =
  | 'ACCIDENT'
  | 'FLOOD'
  | 'CONSTRUCTION'
  | 'FIRE'
  | 'OTHER'
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IncidentStatus = 'OPEN' | 'RESOLVED' | 'PENDING'

export interface IncidentFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number] // [Lng, Lat]
  }
  properties: {
    id: string
    type: IncidentType
    severity: IncidentSeverity
    title: string
    description: string
    status: IncidentStatus
    timestamp: string
  }
}

export interface IncidentCollection {
  type: 'FeatureCollection'
  features: IncidentFeature[]
}

export interface UserNewsItem {
  incidentId: string
  incidentType: string
  roadName: string
  occurredAt: string
  imageUrl: string | null
  distanceKm: number
  location: {
    lat: number
    long: number
  }
}

export interface NewsFeedResponse {
  items: UserNewsItem[]
}

export type CitizenReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface CitizenReportItem {
  reportId: string
  incidentType: string
  status: CitizenReportStatus
  description: string | null
  imageUrl: string | null
  moderationNote: string | null
  roadName: string
  occurredAt: string
  updatedAt: string
  location: {
    lat: number
    long: number
  }
  distanceKm?: number
  reporterId?: string
}

export interface CitizenReportListResponse {
  items: CitizenReportItem[]
}

export interface IncidentReportCreateResponse {
  reportId: string
  status: CitizenReportStatus
  message: string
}

export interface WeatherData {
  temp_c: number | null
  condition_code: number
  condition_text: string
  humidity: number | null
  wind_kph: number | null
  impact_level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
  warning_message: string
  last_updated: string
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

export interface ApiResponse<T = any> {
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
