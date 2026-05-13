// API Service Configuration

import {
  ApiResponse,
  CitizenReportListResponse,
  ComparisonDataPoint,
  ComparisonQueryParams,
  CorridorAnalyticsOption,
  CorridorDashboardData,
  CorridorDashboardQueryParams,
  CorridorReliabilityData,
  CorridorReliabilityQueryParams,
  HistoryHotspotPoint,
  HistoryQueryParams,
  HistoryResponse,
  IncidentCollection,
  IncidentImpactResponse,
  IncidentReportCreateResponse,
  NewsFeedResponse,
  OlapCrossAnalysisPoint,
  OlapDrilldownParams,
  OlapDrilldownResponse,
  OlapHeatmapCell,
  OlapQueryParams,
  PlaceSearchResult,
  PredictionRequestBody,
  PredictionResponse,
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
const aiCoreURL = import.meta.env.VITE_AI_CORE_URL

type AccessTokenGetter = () => Promise<string | null>

let accessTokenGetter: AccessTokenGetter | null = null

export const setAccessTokenGetter = (getter: AccessTokenGetter | null) => {
  accessTokenGetter = getter
}

const axiosInstance: AxiosInstance = axios.create({
  baseURL,
  timeout: 30 * 60 * 1000, // 30 minutes
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
  getStatus: (params?: {
    asOf?: string
  }): Promise<ApiResponse<TrafficStatus[]>> =>
    axiosInstance.get('/map/status', { params }),
  getStatusSnapshots: (params?: {
    limit?: number
    before?: string
    start?: string
    end?: string
  }): Promise<ApiResponse<string[]>> =>
    axiosInstance.get('/map/status/snapshots', { params }),
  getSegmentStatus: (
    segmentId: number,
    params?: { asOf?: string }
  ): Promise<ApiResponse<TrafficStatus>> =>
    axiosInstance.get(`/map/status/${segmentId}`, { params }),
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
  getIncidentImpactPropagation: (
    incidentId: string,
    params?: {
      radiusMeters?: number
      targetSpeedKmh?: number
      ttiThreshold?: number
      maxDepth?: number
      maxSegments?: number
    }
  ): Promise<ApiResponse<IncidentImpactResponse>> =>
    axiosInstance.get(`/incidents/${incidentId}/impact-propagation`, {
      params,
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

export const olapApi = {
  getHeatmap: (
    params?: OlapQueryParams,
    signal?: AbortSignal
  ): Promise<ApiResponse<OlapHeatmapCell[]>> =>
    axiosInstance.get('/olap/heatmap', { params, signal }),

  getCrossAnalysis: (
    params?: OlapQueryParams,
    signal?: AbortSignal
  ): Promise<ApiResponse<OlapCrossAnalysisPoint[]>> =>
    axiosInstance.get('/olap/cross-analysis', { params, signal }),

  getDrilldown: (
    params?: OlapDrilldownParams,
    signal?: AbortSignal
  ): Promise<ApiResponse<OlapDrilldownResponse>> =>
    axiosInstance.get('/olap/drilldown', { params, signal }),
}

export const historyApi = {
  getHistory: (
    params: HistoryQueryParams,
    signal?: AbortSignal
  ): Promise<ApiResponse<HistoryResponse>> =>
    axiosInstance.get('/history', { params, signal }),
  getHotspots: (
    params: Omit<HistoryQueryParams, 'page' | 'limit'>,
    signal?: AbortSignal
  ): Promise<ApiResponse<HistoryHotspotPoint[]>> =>
    axiosInstance.get('/history/hotspots', { params, signal }),
  exportHistory: (
    params: Omit<HistoryQueryParams, 'page' | 'limit'>,
    signal?: AbortSignal
  ): Promise<Blob> =>
    axiosInstance.get('/history/export', {
      params,
      signal,
      responseType: 'blob',
    }),
}

// Simulation API
export const simulationApi = {
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
  getDynamicRoute: (
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
  ): Promise<ApiResponse<any>> =>
    axiosInstance.get('/simulation/routes', {
      params: { startLat, startLng, endLat, endLng },
    }),
}

export const searchApi = {
  searchPlaces: (
    q: string,
    signal?: AbortSignal
  ): Promise<PlaceSearchResult[]> =>
    axiosInstance.get('/search/places', {
      params: { q },
      signal,
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

// News Ticker API
export const newsApi = {
  getTicker: (): Promise<ApiResponse<{ news: string }>> =>
    axiosInstance.get('/news/ticker'),
}

// Prediction API
export const predictionApi = {
  getBatchPrediction: (
    data: PredictionRequestBody
  ): Promise<PredictionResponse> =>
    axiosInstance.post('/congestion-prediction/batch', data, {
      baseURL: aiCoreURL,
    }),
}

export default axiosInstance
