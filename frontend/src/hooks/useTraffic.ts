// Custom Hooks

import { analyticsApi, mapApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'
import { Alert, IncidentFeature, TrafficStatus } from '@/types'
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

export const useIncidents = () => {
  const [incidents, setIncidents] = useState<IncidentFeature[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([])

  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

  const fetchIncidents = async () => {
    try {
      const res = await fetch(`${API_URL}/incidents`)
      const json = await res.json()

      if (json.success && json.data && Array.isArray(json.data.features)) {
        const features: IncidentFeature[] = json.data.features
        setIncidents(features)

        const mappedAlerts: Alert[] = features.map((feature) => {
          const typeStr = feature.properties.type.toString().toLowerCase()
          let mappedType: 'accident' | 'congestion' | 'roadwork' | 'weather' =
            'accident'
          if (typeStr.includes('congestion') || typeStr.includes('traffic'))
            mappedType = 'congestion'
          if (typeStr.includes('work') || typeStr.includes('construction'))
            mappedType = 'roadwork'
          if (
            typeStr.includes('weather') ||
            typeStr.includes('rain') ||
            typeStr.includes('flood')
          )
            mappedType = 'weather'

          const sevStr = feature.properties.severity.toString().toUpperCase()
          let mappedSeverity: 1 | 2 | 3 | 4 | 5 = 1
          if (sevStr === 'CRITICAL') mappedSeverity = 5
          else if (sevStr === 'HIGH' || sevStr === 'MAJOR') mappedSeverity = 4
          else if (sevStr === 'MEDIUM' || sevStr === 'MODERATE')
            mappedSeverity = 3
          else if (sevStr === 'LOW' || sevStr === 'MINOR') mappedSeverity = 2

          return {
            id: feature.id,
            segmentId: 0,
            segmentName: feature.properties.type,
            incidentType: mappedType,
            severity: mappedSeverity,
            description: feature.properties.description,
            timestamp: new Date(feature.properties.createdAt),
          }
        })

        setLiveAlerts(mappedAlerts)
      }
    } catch (error) {
      console.error('Lỗi khi tải sự kiện giao thông:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIncidents()
    const interval = setInterval(fetchIncidents, 180000)

    return () => clearInterval(interval)
  }, [])

  return { incidents, loading, liveAlerts }
}
