// API Service Configuration

import {
  ApiResponse,
  ForecastData,
  IncidentCollection,
  ReliabilityRankData,
  RoutingData,
  SegmentResponse,
  SpeedComparisonData,
  TrafficStatus,
  VehicleMixData,
  WeatherData,
} from '@/types'
import axios, { AxiosError, AxiosInstance } from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL

type AccessTokenGetter = () => Promise<string | null>

let accessTokenGetter: AccessTokenGetter | null = null

export const setAccessTokenGetter = (getter: AccessTokenGetter | null) => {
  accessTokenGetter = getter
}

const axiosInstance: AxiosInstance = axios.create({
  baseURL,
  timeout: 180000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

axiosInstance.interceptors.request.use(async (config) => {
  if (!accessTokenGetter) {
    return config
  }

  const token = await accessTokenGetter()
  if (!token) {
    return config
  }

  config.headers = config.headers ?? {}
  config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response Interceptor
axiosInstance.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    console.error('API Error:', error.message)
    if (error.response?.status === 500) {
      console.error('Server error:', error.response.data)
    }
    return Promise.reject(error)
  }
)

// Map API
export const mapApi = {
  getSegments: (): Promise<ApiResponse<SegmentResponse>> =>
    axiosInstance.get('/map/segments'),
  getStatus: (): Promise<ApiResponse<TrafficStatus[]>> =>
    axiosInstance.get('/map/status'),
  getSegmentStatus: (segmentId: number): Promise<ApiResponse<TrafficStatus>> =>
    axiosInstance.get(`/map/status/${segmentId}`),
  getIncidents: (
    status: string,
    bbox?: string
  ): Promise<ApiResponse<IncidentCollection>> =>
    axiosInstance.get('/incidents', {
      params: {
        status,
        ...(bbox ? { bbox } : {}),
      },
    }),
}

// Analytics API
export const analyticsApi = {
  getVehicleMix: (): Promise<ApiResponse<VehicleMixData[]>> =>
    axiosInstance.get('/analytics/vehicle-mix'),
  getSpeedComparison: (): Promise<ApiResponse<SpeedComparisonData[]>> =>
    axiosInstance.get('/analytics/speed-comparison'),
  getReliabilityRanking: (): Promise<ApiResponse<ReliabilityRankData[]>> =>
    axiosInstance.get('/analytics/reliability-ranking'),
}

// Simulation API
export const simulationApi = {
  runForecast: (
    segmentId: number,
    horizonMinutes?: number
  ): Promise<ApiResponse<ForecastData[]>> =>
    axiosInstance.post('/simulation/forecast', {
      segmentId,
      horizonMinutes,
    }),
  runRouting: (
    startPoint: [number, number],
    endPoint: [number, number],
    blockedSegments?: number[]
  ): Promise<ApiResponse<RoutingData>> =>
    axiosInstance.post('/simulation/routing', {
      startPoint,
      endPoint,
      blockedSegments,
    }),
}

// Weather API
export const weatherApi = {
  getCurrent: (): Promise<ApiResponse<WeatherData>> =>
    axiosInstance.get('/weather/current'),
}

export default axiosInstance
