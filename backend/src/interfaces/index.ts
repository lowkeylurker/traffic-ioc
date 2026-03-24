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
export type IncidentType = 'ACCIDENT' | 'FLOOD' | 'CONGESTION' | 'CONSTRUCTION' | 'FIRE' | 'OTHER';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'RESOLVED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

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
