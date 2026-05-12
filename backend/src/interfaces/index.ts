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
