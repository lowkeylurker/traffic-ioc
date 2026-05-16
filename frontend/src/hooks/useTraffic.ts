// Custom Hooks

import { POLLING_INTERVALS } from '@/config/constants'
import { analyticsApi, mapApi, weatherApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'
import {
  ComparisonDataPoint,
  ComparisonMetric,
  ComparisonScopeType,
  CorridorDashboardData,
  RoadOption,
  SegmentResponse,
  TrafficStatus,
  WeatherData,
} from '@/types'
import {
  getCachedCorridors,
  getCachedSegments,
  getCachedTrafficStatusWithMeta,
  setCachedCorridors,
  setCachedSegments,
  setCachedTrafficStatus,
} from '@/utils/segmentCache'
import { useCallback, useEffect, useRef, useState } from 'react'
import TrafficWorker from '../workers/traffic-processor.worker?worker'

const TRAFFIC_STATUS_CACHE_MAX_AGE_MS = 60 * 1000 // 1 minute (aligned with backend MV refresh)

// Fetch segments hook (danh sách đoạn đường tĩnh ban đầu - deprecated for map rendering, use useTrafficMap instead)
export const useSegments = () => {
  const { segmentData, setSegmentData, setError } = useAppStore()

  useEffect(() => {
    if (segmentData) {
      return
    }

    let mounted = true

    const fetchSegments = async () => {
      try {
        const cachedSegments = await getCachedSegments()
        if (mounted && cachedSegments) {
          setSegmentData(cachedSegments)
          return
        }

        const response = await mapApi.getSegments()
        if (response.success && response.data && mounted) {
          setSegmentData(response.data)
          await setCachedSegments(response.data)
        }
      } catch (error) {
        console.error('Error fetching segments:', error)
        if (!mounted) {
          return
        }

        setError(
          error instanceof Error ? error.message : 'Failed to fetch segments'
        )
      }
    }

    fetchSegments()

    return () => {
      mounted = false
    }
  }, [segmentData, setSegmentData, setError])

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
export const useTrafficMap = (asOf?: string | null) => {
  const segmentData = useSegments()
  const [trafficMap, setTrafficMap] = useState<SegmentResponse | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    let mounted = true

    const fetchTrafficStatus = async () => {
      if (
        !segmentData ||
        !segmentData.features ||
        segmentData.features.length === 0
      ) {
        return
      }

      try {
        const mergeAndSetTrafficMap = (statuses: TrafficStatus[]) => {
          if (!workerRef.current) {
            workerRef.current = new TrafficWorker()
          }

          workerRef.current.onmessage = (e) => {
            if (e.data.features && mounted) {
              setTrafficMap({
                type: 'FeatureCollection',
                features: e.data.features,
              })
            }
          }

          workerRef.current.postMessage({
            segmentFeatures: segmentData.features,
            statuses,
          })
        }

        if (!asOf) {
          const cachedStatuses = await getCachedTrafficStatusWithMeta(
            TRAFFIC_STATUS_CACHE_MAX_AGE_MS
          )

          if (cachedStatuses) {
            // Always keep existing render using cache; revalidate only when stale.
            mergeAndSetTrafficMap(cachedStatuses.data)
            if (cachedStatuses.isFresh) {
              return
            }
          }
        }

        const response = await mapApi.getStatus(asOf ? { asOf } : undefined)
        if (response.success && response.data) {
          const statuses = response.data as TrafficStatus[]
          if (!asOf) {
            await setCachedTrafficStatus(statuses)
          }
          mergeAndSetTrafficMap(statuses)
        }
      } catch (error) {
        console.error('Error fetching traffic status for map merging:', error)
      }
    }

    // Fetch immediately if segmentData is ready
    fetchTrafficStatus()

    if (!asOf) {
      // Poll status every 5 minutes to reduce unnecessary network load.
      interval = setInterval(
        fetchTrafficStatus,
        POLLING_INTERVALS.TRAFFIC_MAP_STATUS
      )
    }

    return () => {
      mounted = false
      if (interval) {
        clearInterval(interval)
      }
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [asOf, segmentData])

  return trafficMap ?? segmentData
}

// Fetch traffic status hook
export const useTrafficStatus = (asOf?: string | null) => {
  const { trafficStatus, setTrafficStatus, setError } = useAppStore()

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        if (!asOf) {
          const cachedStatus = await getCachedTrafficStatusWithMeta(
            TRAFFIC_STATUS_CACHE_MAX_AGE_MS
          )

          if (cachedStatus) {
            // Keep old data while revalidating in background when stale.
            setTrafficStatus(cachedStatus.data)
            if (cachedStatus.isFresh) {
              return
            }
          }
        }

        const response = await mapApi.getStatus(asOf ? { asOf } : undefined)
        if (response.success && response.data) {
          const statuses = response.data as TrafficStatus[]
          setTrafficStatus(statuses)
          if (!asOf) {
            await setCachedTrafficStatus(statuses)
          }
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
    // Polling every 1 minute for live mode only (matches backend MV refresh rate).
    const interval = asOf ? undefined : setInterval(fetchStatus, 60000)

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [asOf, setTrafficStatus, setError])

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

const CORRIDOR_DASHBOARD_CACHE_TTL_MS = 60 * 1000
const corridorDashboardCache = new Map<
  string,
  { data: CorridorDashboardData; timestamp: number }
>()

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
  const { corridorOptions: corridors, setCorridorOptions: setCorridors } =
    useAppStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchCorridors = async () => {
      // Avoid redundant fetching if global state is already populated
      if (corridors.length > 0) {
        return
      }

      setLoading(true)
      try {
        // Try reading from cache first
        const cached = await getCachedCorridors()
        if (mounted && cached && cached.length > 0) {
          setCorridors(cached)
          setLoading(false)
          return // Return early if we have cache for static data
        }

        const response = await analyticsApi.getCorridors()
        if (response.success && response.data && mounted) {
          setCorridors(response.data)
          await setCachedCorridors(response.data)
          setError(null)
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to fetch corridors'
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchCorridors()

    return () => {
      mounted = false
    }
  }, [corridors.length, setCorridors])

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
    const cacheKey = `${params.date}::${params.corridorKey ?? 'ALL'}`
    const cached = corridorDashboardCache.get(cacheKey)
    if (
      cached &&
      Date.now() - cached.timestamp <= CORRIDOR_DASHBOARD_CACHE_TTL_MS
    ) {
      setData(cached.data)
      setError(null)
      return
    }

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
        corridorDashboardCache.set(cacheKey, {
          data: response.data,
          timestamp: Date.now(),
        })
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
