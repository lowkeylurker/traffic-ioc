// API Service Configuration

import {
  ApiResponse,
  ComparisonDataPoint,
  ComparisonQueryParams,
  CorridorReliabilityData,
  CorridorReliabilityQueryParams,
  CorridorAnalyticsOption,
  CorridorDashboardData,
  CorridorDashboardQueryParams,
  CitizenReportListResponse,
  ForecastData,
  IncidentCollection,
  IncidentReportCreateResponse,
  NewsFeedResponse,
  RelativeComparisonResult,
  ReliabilityRankData,
  RoadOption,
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
  getRoads: (): Promise<ApiResponse<RoadOption[]>> =>
    axiosInstance.get('/map/roads'),
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
  getComparison: (
    params: ComparisonQueryParams,
    signal?: AbortSignal
  ): Promise<ApiResponse<ComparisonDataPoint[]>> =>
    axiosInstance.get('/analytics/comparison', { params, signal }),
  getRelativeComparison: (
    params: ComparisonQueryParams,
    signal?: AbortSignal
  ): Promise<ApiResponse<RelativeComparisonResult>> =>
    axiosInstance.get('/analytics/relative-comparison', { params, signal }),
  getCorridors: (): Promise<ApiResponse<CorridorAnalyticsOption[]>> =>
    axiosInstance.get('/analytics/corridors'),
  getCorridorDashboard: (
    params: CorridorDashboardQueryParams,
    signal?: AbortSignal
  ): Promise<ApiResponse<CorridorDashboardData>> =>
    axiosInstance.get('/analytics/corridor-dashboard', { params, signal }),
  getCorridorReliability: (
    params: CorridorReliabilityQueryParams,
    signal?: AbortSignal
  ): Promise<ApiResponse<CorridorReliabilityData[]>> =>
    axiosInstance.get('/analytics/reliability', { params, signal }),
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
  getSegments: (): Promise<ApiResponse<unknown>> =>
    axiosInstance.get('/weather/segments'),
  getVoronoi: (): Promise<ApiResponse<unknown>> =>
    axiosInstance.get('/weather/voronoi'),
}

// User crowdsourcing API
export const userApi = {
  getNews: (params: {
    lat: number
    long: number
    radius?: number
  }): Promise<ApiResponse<NewsFeedResponse>> =>
    axiosInstance.get('/user/news', { params }),

  submitReport: (
    formData: FormData
  ): Promise<ApiResponse<IncidentReportCreateResponse>> =>
    axiosInstance.post('/user/report', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),

  getMyReports: (params?: {
    status?: 'PENDING' | 'APPROVED' | 'REJECTED'
  }): Promise<ApiResponse<CitizenReportListResponse>> =>
    axiosInstance.get('/user/reports/me', { params }),

  getReportsForAdmin: (params?: {
    status?: 'PENDING' | 'APPROVED' | 'REJECTED'
  }): Promise<ApiResponse<CitizenReportListResponse>> =>
    axiosInstance.get('/user/reports', { params }),

  moderateReport: (
    reportId: string,
    payload: { status: 'APPROVED' | 'REJECTED'; note?: string }
  ): Promise<ApiResponse<null>> =>
    axiosInstance.patch(`/user/report/${reportId}/status`, payload),
}

export default axiosInstance
