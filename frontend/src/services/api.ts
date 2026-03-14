// API Service Configuration

import axios, { AxiosInstance, AxiosError } from 'axios'
import { ApiResponse, WeatherData } from '@/types'

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
  getSegments: (): Promise<ApiResponse<any>> =>
    axiosInstance.get('/map/segments'),
  getStatus: (): Promise<ApiResponse<any>> =>
    axiosInstance.get('/map/status'),
  getSegmentStatus: (segmentId: number): Promise<ApiResponse<any>> =>
    axiosInstance.get(`/map/status/${segmentId}`),
}

// Analytics API
export const analyticsApi = {
  getVehicleMix: (): Promise<ApiResponse<any>> =>
    axiosInstance.get('/analytics/vehicle-mix'),
  getSpeedComparison: (): Promise<ApiResponse<any>> =>
    axiosInstance.get('/analytics/speed-comparison'),
  getReliabilityRanking: (): Promise<ApiResponse<any>> =>
    axiosInstance.get('/analytics/reliability-ranking'),
}

// Simulation API
export const simulationApi = {
  runForecast: (segmentId: number, horizonMinutes?: number): Promise<ApiResponse<any>> =>
    axiosInstance.post('/simulation/forecast', {
      segmentId,
      horizonMinutes,
    }),
  runRouting: (startPoint: [number, number], endPoint: [number, number], blockedSegments?: number[]): Promise<ApiResponse<any>> =>
    axiosInstance.post('/simulation/routing', {
      startPoint,
      endPoint,
      blockedSegments,
    }),
}

// Weather API
export const weatherApi = {
  getCurrentWeather: (): Promise<ApiResponse<WeatherData>> =>
    axiosInstance.get('/weather/current'),
}

export default axiosInstance
