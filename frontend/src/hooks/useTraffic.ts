// Custom Hooks

import { analyticsApi, mapApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'
import { TrafficStatus } from '@/types'
import { useEffect, useState } from 'react'

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
