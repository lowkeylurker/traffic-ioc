// Custom Hooks

import { useEffect, useState } from 'react'
import { Segment, TrafficStatus } from '@/types'
import { mapApi, analyticsApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'

// Fetch segments hook
export const useSegments = () => {
  const { segments, setSegments, setError } = useAppStore()

  useEffect(() => {
    const fetchSegments = async () => {
      try {
        const response = await mapApi.getSegments()
        if (response.success && response.data) {
          setSegments(response.data as Segment[])
        }
      } catch (error) {
        console.error('Error fetching segments:', error)
        setError(
          error instanceof Error ? error.message : 'Failed to fetch segments'
        )
      }
    }

    fetchSegments()
  }, [setSegments, setError])

  return segments
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
    const interval = setInterval(fetchStatus, 10000)

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
