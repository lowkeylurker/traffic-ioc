// API Service Configuration

import axios, { AxiosInstance, AxiosError } from 'axios'
import { ApiResponse } from '@/types'

const baseURL = import.meta.env.VITE_API_BASE_URL

const axiosInstance: AxiosInstance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
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
  getSegments: (): Promise<ApiResponse> =>
    axiosInstance.get('/map/segments'),
  getStatus: (): Promise<ApiResponse> =>
    axiosInstance.get('/map/status'),
  getSegmentStatus: (segmentId: number): Promise<ApiResponse> =>
    axiosInstance.get(`/map/status/${segmentId}`),
}

// Analytics API
export const analyticsApi = {
  getVehicleMix: (): Promise<ApiResponse> =>
    axiosInstance.get('/analytics/vehicle-mix'),
  getSpeedComparison: (): Promise<ApiResponse> =>
    axiosInstance.get('/analytics/speed-comparison'),
  getReliabilityRanking: (): Promise<ApiResponse> =>
    axiosInstance.get('/analytics/reliability-ranking'),
}

// Simulation API
export const simulationApi = {
  runForecast: (segmentId: number, horizonMinutes?: number): Promise<ApiResponse> =>
    axiosInstance.post('/simulation/forecast', {
      segmentId,
      horizonMinutes,
    }),
  runRouting: (startPoint: [number, number], endPoint: [number, number], blockedSegments?: number[]): Promise<ApiResponse> =>
    axiosInstance.post('/simulation/routing', {
      startPoint,
      endPoint,
      blockedSegments,
    }),
}

export default axiosInstance
