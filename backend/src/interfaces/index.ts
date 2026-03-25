// Interfaces cho custom types
import { LineString } from 'geojson';

export interface TrafficSegment {
  segmentId: number;
  segmentName: string;
  geometry: GeoJSON.LineString;
  numLanes: number;
  speedLimit: number;
}

export interface TrafficStatus {
  segmentId: number;
  segmentName: string;
  currentSpeed: number;
  avgSpeed: number;
  losGrade: string;
  losScore: number;
  pcuValue: number;
  occupancyRate: number;
  timestamp: Date;
}

export interface VehicleMixData {
  category: string;
  count: number;
  percentage: number;
}

export interface ForecastRequest {
  segmentId: number;
  horizonMinutes?: number;
}

export interface ForecastResponse {
  segmentId: number;
  predictedSpeed: number;
  predictedLos: string;
  confidenceScore: number;
  forecastTime: Date;
}

export interface RoutingRequest {
  startPoint: [number, number];
  endPoint: [number, number];
  blockedSegments?: number[];
}

export interface RoutingResponse {
  route: LineString;
  totalDistance: number;
  estimatedTime: number;
}

// Incident Monitoring Interfaces (A2)
export type IncidentType = 'ACCIDENT' | 'FLOOD' | 'CONSTRUCTION' | 'FIRE' | 'OTHER';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'RESOLVED' | 'PENDING';

export interface Incident {
  id: string;
  geom: {
    type: 'Point';
    coordinates: [number, number];
  };
  type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  status: IncidentStatus;
  source: string;
  created_at: Date;
  updated_at: Date;
}

export interface IncidentFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    type: IncidentType;
    severity: IncidentSeverity;
    title: string;
    description: string;
    status: IncidentStatus;
    timestamp: string;
  };
}

export interface IncidentQuery {
  status?: IncidentStatus;
  bbox?: string; // minLng,minLat,maxLng,maxLat
}

export interface WeatherData {
  temp_c: number | null;
  condition_code: number;
  condition_text: string;
  humidity: number | null;
  wind_kph: number | null;
  impact_level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  warning_message: string;
  last_updated: string;
}

export type ComparisonMetric =
  | 'currentSpeedKmh'
  | 'pcuVolume'
  | 'trafficIndex'
  | 'losScore'
  | 'congestionLevel'
  | 'delaySeconds'
  | 'occupancyRate'
  | 'bufferIndex';

export type ComparisonScopeType = 'segment' | 'road';

export interface ComparisonQuery {
  scopeType: ComparisonScopeType;
  segmentId?: string;
  roadKey?: string;
  metric: ComparisonMetric;
  date: string;
}

export interface ComparisonPoint {
  hour: number;
  baselineAvg: number | null;
  baselineStdDev: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  todayValue: number | null;
  isAnomaly: boolean;
  unit: string;
  metric: ComparisonMetric;
}

export interface CorridorDashboardQuery {
  date: string;
  corridorKey?: string;
}

export interface CorridorOption {
  corridorKey: string;
  corridorName: string;
  importanceLevel: number | null;
  targetAvgSpeed: number | null;
}

export interface CorridorKpi {
  avgCorridorSpeed: number | null;
  targetAvgSpeed: number | null;
  totalDelaySeconds: number | null;
  travelTimeIndex: number | null;
  corridorEfficiency: number | null;
  activeIncidentCount: number | null;
}

export interface CorridorSpeedTargetPoint {
  hour: number;
  avgCorridorSpeed: number | null;
  targetAvgSpeed: number | null;
}

export interface CorridorTtiPoint {
  hour: number;
  travelTimeIndex: number | null;
}

export interface CorridorDelayRankingItem {
  corridorKey: string;
  corridorName: string;
  totalDelaySeconds: number;
}

export interface CorridorHeatmapCell {
  corridorKey: string;
  corridorName: string;
  hour: number;
  travelTimeIndex: number | null;
}

export interface CorridorBottleneckItem {
  segmentKey: string;
  count: number;
}

export interface CorridorAlerts {
  isBelowTargetSpeed: boolean;
  isHighTti: boolean;
  isHighIncidentCount: boolean;
}

export interface CorridorBaselineComparison {
  speedDeltaPct: number | null;
  delayDeltaPct: number | null;
}

export interface CorridorDashboardData {
  kpis: CorridorKpi;
  speedVsTarget: CorridorSpeedTargetPoint[];
  ttiHourly: CorridorTtiPoint[];
  topDelayCorridors: CorridorDelayRankingItem[];
  heatmap: CorridorHeatmapCell[];
  topBottlenecks: CorridorBottleneckItem[];
  alerts: CorridorAlerts;
  baselineComparison: CorridorBaselineComparison;
}
