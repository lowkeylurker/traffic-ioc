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
    roadKey?: string
    roadName?: string
    isCorridor?: boolean
    avgSpeed?: number
    losIndex?: string
    color?: string
    lastUpdated?: string
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
  isCorridor?: boolean
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

export type ImpactSeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface IncidentImpactSegment {
  segmentId: string
  geometry: {
    type: 'LineString'
    coordinates: number[][]
  }
  currentSpeed: number
  targetSpeed: number
  tti: number
  distanceFromIncidentM: number
  severityLevel: ImpactSeverityLevel
}

export interface IncidentImpactSummary {
  totalImpactedSegments: number
  impactedLengthKm: number
  maxQueueDistanceKm: number
  severityScore: number
}

export interface IncidentImpactResponse {
  incident: {
    incidentId: string
    type: IncidentType
    severity: IncidentSeverity
    timestamp: string
    coordinates: [number, number]
  }
  impactedSegments: IncidentImpactSegment[]
  summary: IncidentImpactSummary
  degradedMode: boolean
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

export type ComparisonMetric =
  | 'currentSpeedKmh'
  | 'pcuVolume'
  | 'trafficIndex'
  | 'losScore'
  | 'congestionLevel'
  | 'delaySeconds'
  | 'occupancyRate'
  | 'bufferIndex'

export type ComparisonScopeType = 'segment' | 'road'

export interface RoadOption {
  roadKey: string
  roadName: string
}

export interface ComparisonDataPoint {
  hour: number
  baselineAvg: number | null
  baselineStdDev: number | null
  lowerBound: number | null
  upperBound: number | null
  todayValue: number | null
  isAnomaly: boolean
  unit: string
  metric: ComparisonMetric
}

export interface TrendPoint {
  label: string
  value: number | null
}

export interface RelativeComparisonResult {
  yesterday: ComparisonDataPoint[]
  lastWeek: ComparisonDataPoint[]
  trend7: TrendPoint[]
}

export interface ComparisonQueryParams {
  scopeType?: ComparisonScopeType
  segmentId?: string
  roadKey?: string
  metric: ComparisonMetric
  date: string
}

export interface CorridorAnalyticsOption {
  corridorKey: string
  corridorName: string
  importanceLevel: number | null
  targetAvgSpeed: number | null
}

export interface CorridorKpi {
  avgCorridorSpeed: number | null
  targetAvgSpeed: number | null
  totalDelaySeconds: number | null
  travelTimeIndex: number | null
  corridorEfficiency: number | null
  activeIncidentCount: number | null
}

export interface CorridorSpeedTargetPoint {
  hour: number
  avgCorridorSpeed: number | null
  targetAvgSpeed: number | null
}

export interface CorridorTtiPoint {
  hour: number
  travelTimeIndex: number | null
}

export interface CorridorDelayRankingItem {
  corridorKey: string
  corridorName: string
  totalDelaySeconds: number
}

export interface CorridorHeatmapCell {
  corridorKey: string
  corridorName: string
  hour: number
  travelTimeIndex: number | null
}

export interface CorridorBottleneckItem {
  segmentKey: string
  count: number
}

export interface CorridorAlerts {
  isBelowTargetSpeed: boolean
  isHighTti: boolean
  isHighIncidentCount: boolean
}

export interface CorridorBaselineComparison {
  speedDeltaPct: number | null
  delayDeltaPct: number | null
}

export interface CorridorDashboardData {
  kpis: CorridorKpi
  speedVsTarget: CorridorSpeedTargetPoint[]
  ttiHourly: CorridorTtiPoint[]
  topDelayCorridors: CorridorDelayRankingItem[]
  heatmap: CorridorHeatmapCell[]
  topBottlenecks: CorridorBottleneckItem[]
  alerts: CorridorAlerts
  baselineComparison: CorridorBaselineComparison
}

export interface CorridorDashboardQueryParams {
  date: string
  corridorKey?: string
}

export type ReliabilityTimeWindow = 'AM_PEAK' | 'PM_PEAK' | 'OFF_PEAK'
export type ReliabilitySortBy = 'buffer_index' | 'pti'

export interface CorridorReliabilityRootCauses {
  accident: number
  flood: number
  construction: number
}

export interface CorridorReliabilityData {
  corridorKey: string
  corridorName: string
  segmentKey: string
  segmentName: string
  geometry: GeoJSON.LineString | null
  timeWindow: ReliabilityTimeWindow
  periodStart: string
  periodEnd: string
  tAvg: number | null
  t95: number | null
  tFreeflow: number | null
  bufferIndex: number | null
  pti: number | null
  rootCauses: CorridorReliabilityRootCauses
}

export interface CorridorReliabilityQueryParams {
  timeWindow?: ReliabilityTimeWindow
  sortBy?: ReliabilitySortBy
  limit?: number
  corridorKey?: string
}

export type OlapAnalyzeType = 'heatmap' | 'scatter' | 'drilldown'
export type OlapDrillLevel = 'year' | 'month'

export interface OlapAnalyzeCommonParams {
  startDate?: string
  endDate?: string
  districts?: string
  weatherImpactMin?: number
  weatherImpactMax?: number
}

export interface OlapHeatmapParams extends OlapAnalyzeCommonParams {
  type: 'heatmap'
}

export interface OlapScatterParams extends OlapAnalyzeCommonParams {
  type: 'scatter'
}

export interface OlapDrilldownParams extends OlapAnalyzeCommonParams {
  type: 'drilldown'
  level: OlapDrillLevel
  value: string
}

// [dayOfWeek, hourOfDay, ttiValue]
export type OlapHeatmapCell = [number, number, number]

export interface OlapScatterPoint {
  weather_impact_score: number
  avg_tti: number
  incident_count: number
  district: string
}

export interface OlapDrilldownPoint {
  bucket: string
  avg_tti: number
  incident_count: number
}

export interface OlapDrilldownResponse {
  level: OlapDrillLevel
  value: string
  points: OlapDrilldownPoint[]
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
