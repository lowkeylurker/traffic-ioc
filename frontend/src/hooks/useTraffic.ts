// Custom Hooks

import { POLLING_INTERVALS } from '@/config/constants'
import { analyticsApi, mapApi, weatherApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'
import {
  ComparisonDataPoint,
  ComparisonMetric,
  ComparisonScopeType,
  CorridorAnalyticsOption,
  CorridorDashboardData,
  RoadOption,
  TrafficStatus,
  WeatherData,
} from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'

// Fetch segments hook (danh sách đoạn đường tĩnh ban đầu - deprecated for map rendering, use useTrafficMap instead)
export const useSegments = () => {
  const { segmentData, setSegmentData, setError } = useAppStore()

  useEffect(() => {
    const fetchSegments = async () => {
      try {
        const response = await mapApi.getSegments()
        if (response.success && response.data) {
          setSegmentData(response.data)
        }
      } catch (error) {
        console.error('Error fetching segments:', error)
        setError(
          error instanceof Error ? error.message : 'Failed to fetch segments'
        )
      }
    }

    fetchSegments()
  }, [setSegmentData, setError])

  return segmentData
}

export const useRoads = () => {
  const [roads, setRoads] = useState<RoadOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRoads = async () => {
      setLoading(true)
      try {
        const response = await mapApi.getRoads()
        if (response.success && response.data) {
          setRoads(response.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch roads')
      } finally {
        setLoading(false)
      }
    }

    fetchRoads()
  }, [])

  return { roads, loading, error }
}

// Get data of road segments with speed color (GeoJSON FeatureCollection) with polling
export const useTrafficMap = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trafficMap, setTrafficMap] = useState<any>({
    type: 'FeatureCollection',
    features: [],
  })

  useEffect(() => {
    const fetchTrafficMap = async () => {
      try {
        const response = await mapApi.getSegments()
        if (response.success && response.data) {
          setTrafficMap(response.data)
        }
      } catch (error) {
        console.error('Error fetching traffic map:', error)
      }
    }

    fetchTrafficMap()
    // Polling 15 giây/lần
    const interval = setInterval(fetchTrafficMap, 15000)

    return () => clearInterval(interval)
  }, [])

  return trafficMap
}

// Fetch traffic status hook
export const useTrafficStatus = () => {
  const { trafficStatus, setTrafficStatus, setError } = useAppStore()

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await mapApi.getStatus()
        if (response.success && response.data) {
          setTrafficStatus(response.data as TrafficStatus[])
        }
      } catch (error) {
        console.error('Error fetching traffic status:', error)
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to fetch traffic status'
        )
      }
    }

    fetchStatus()
    // Polling every 10 seconds
    const interval = setInterval(fetchStatus, 120000)

    return () => clearInterval(interval)
  }, [setTrafficStatus, setError])

  return trafficStatus
}

// Fetch analytics data hook
export const useAnalytics = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [vehicleMix, setVehicleMix] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [speedComparison, setSpeedComparison] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reliabilityRanking, setReliabilityRanking] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true)
      try {
        const [vehicleRes, speedRes, reliabilityRes] = await Promise.all([
          analyticsApi.getVehicleMix(),
          analyticsApi.getSpeedComparison(),
          analyticsApi.getReliabilityRanking(),
        ])

        if (vehicleRes.success && vehicleRes.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setVehicleMix(vehicleRes.data as any[])
        }
        if (speedRes.success && speedRes.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setSpeedComparison(speedRes.data as any[])
        }
        if (reliabilityRes.success && reliabilityRes.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setReliabilityRanking(reliabilityRes.data as any[])
        }
      } catch (err) {
        console.error('Error fetching analytics:', err)
        setError(
          err instanceof Error ? err.message : 'Failed to fetch analytics'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [])

  return { vehicleMix, speedComparison, reliabilityRanking, loading, error }
}

interface AnalyticsComparisonParams {
  scopeType: ComparisonScopeType
  segmentId?: string
  roadKey?: string
  metric: ComparisonMetric
  date: string
}

export const useAnalyticsComparison = (params: AnalyticsComparisonParams) => {
  const [data, setData] = useState<ComparisonDataPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchComparison = useCallback(async () => {
    if (params.scopeType === 'segment' && !params.segmentId) {
      setData([])
      return
    }

    if (params.scopeType === 'road' && !params.roadKey) {
      setData([])
      return
    }

    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)

    try {
      const response = await analyticsApi.getComparison(
        {
          scopeType: params.scopeType,
          segmentId: params.segmentId,
          roadKey: params.roadKey,
          metric: params.metric,
          date: params.date,
        },
        controller.signal
      )

      if (response.success && response.data) {
        setData(response.data)
        setError(null)
      } else {
        setData([])
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return
      }

      setError(
        err instanceof Error ? err.message : 'Failed to fetch comparison data'
      )
    } finally {
      setLoading(false)
    }
  }, [
    params.date,
    params.metric,
    params.roadKey,
    params.scopeType,
    params.segmentId,
  ])

  useEffect(() => {
    fetchComparison()

    const interval = setInterval(
      fetchComparison,
      POLLING_INTERVALS.ANALYTICS_COMPARISON
    )

    return () => {
      clearInterval(interval)
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [fetchComparison])

  return {
    data,
    loading,
    error,
    refetch: fetchComparison,
  }
}

interface CorridorDashboardParams {
  date: string
  corridorKey?: string
}

const emptyCorridorDashboard: CorridorDashboardData = {
  kpis: {
    avgCorridorSpeed: null,
    targetAvgSpeed: null,
    totalDelaySeconds: null,
    travelTimeIndex: null,
    corridorEfficiency: null,
    activeIncidentCount: null,
  },
  speedVsTarget: [],
  ttiHourly: [],
  topDelayCorridors: [],
  heatmap: [],
  topBottlenecks: [],
  alerts: {
    isBelowTargetSpeed: false,
    isHighTti: false,
    isHighIncidentCount: false,
  },
  baselineComparison: {
    speedDeltaPct: null,
    delayDeltaPct: null,
  },
}

export const useCorridorOptions = () => {
  const [corridors, setCorridors] = useState<CorridorAnalyticsOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCorridors = async () => {
      setLoading(true)
      try {
        const response = await analyticsApi.getCorridors()
        if (response.success && response.data) {
          setCorridors(response.data)
          setError(null)
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch corridors'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchCorridors()
  }, [])

  return { corridors, loading, error }
}

export const useCorridorDashboard = (params: CorridorDashboardParams) => {
  const [data, setData] = useState<CorridorDashboardData>(
    emptyCorridorDashboard
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchCorridorDashboard = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)

    try {
      const response = await analyticsApi.getCorridorDashboard(
        {
          date: params.date,
          corridorKey: params.corridorKey,
        },
        controller.signal
      )

      if (response.success && response.data) {
        setData(response.data)
        setError(null)
      } else {
        setData(emptyCorridorDashboard)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch corridor dashboard data'
      )
      setData(emptyCorridorDashboard)
    } finally {
      setLoading(false)
    }
  }, [params.corridorKey, params.date])

  useEffect(() => {
    fetchCorridorDashboard()

    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [fetchCorridorDashboard])

  return {
    data,
    loading,
    error,
    refetch: fetchCorridorDashboard,
  }
}

// Fetch weather data hook
export const useWeather = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const fetchWeather = async () => {
      setLoading(true)
      try {
        const response = await weatherApi.getCurrent()
        if (response.success && response.data && mounted) {
          setWeather(response.data as WeatherData)
          setError(null)
        }
      } catch (err) {
        console.error('Error fetching weather:', err)
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to fetch weather data'
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchWeather()
    const interval = setInterval(fetchWeather, POLLING_INTERVALS.WEATHER_DATA)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return { weather, loading, error }
}
