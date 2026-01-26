// Custom Hooks

import { useEffect, useState } from 'react'
import { Segment, TrafficStatus, Alert } from '@/types'
import { mapApi, analyticsApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'

// Fetch segments hook
export const useSegments = () => {
  const { segments, setSegments, setLoading, setError } = useAppStore()

  useEffect(() => {
    const fetchSegments = async () => {
      setLoading(true)
      try {
        const response = await mapApi.getSegments()
        if (response.success && response.data) {
          setSegments(response.data as Segment[])
        }
      } catch (error) {
        console.error('Error fetching segments:', error)
        setError(error instanceof Error ? error.message : 'Failed to fetch segments')
      } finally {
        setLoading(false)
      }
    }

    fetchSegments()
  }, [setSegments, setLoading, setError])

  return segments
}

// Fetch traffic status hook
export const useTrafficStatus = () => {
  const { trafficStatus, setTrafficStatus, setLoading, setError } = useAppStore()

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await mapApi.getStatus()
        if (response.success && response.data) {
          setTrafficStatus(response.data as TrafficStatus[])
        }
      } catch (error) {
        console.error('Error fetching traffic status:', error)
        setError(error instanceof Error ? error.message : 'Failed to fetch traffic status')
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
  const [vehicleMix, setVehicleMix] = useState<any[]>([])
  const [speedComparison, setSpeedComparison] = useState<any[]>([])
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

        if (vehicleRes.success && vehicleRes.data) setVehicleMix(vehicleRes.data as any[])
        if (speedRes.success && speedRes.data) setSpeedComparison(speedRes.data as any[])
        if (reliabilityRes.success && reliabilityRes.data) setReliabilityRanking(reliabilityRes.data as any[])
      } catch (err) {
        console.error('Error fetching analytics:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics')
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [])

  return { vehicleMix, speedComparison, reliabilityRanking, loading, error }
}
