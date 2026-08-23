// Global App Store (Zustand)

import { Alert, CorridorAnalyticsOption, SegmentResponse, TrafficStatus } from '@/types'
import { create } from 'zustand'

interface AppStore {
  // State
  segmentData: SegmentResponse | null
  trafficStatus: TrafficStatus[]
  corridorOptions: CorridorAnalyticsOption[]
  alerts: Alert[]
  selectedSegmentId: number | null
  isLoading: boolean
  error: string | null

  // Actions
  setSegmentData: (segmentData: SegmentResponse | null) => void
  setTrafficStatus: (status: TrafficStatus[]) => void
  setCorridorOptions: (corridors: CorridorAnalyticsOption[]) => void
  setAlerts: (alerts: Alert[]) => void
  selectSegment: (segmentId: number | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  // Initial State
  segmentData: null,
  trafficStatus: [],
  corridorOptions: [],
  alerts: [],
  selectedSegmentId: null,
  isLoading: false,
  error: null,

  // Actions
  setSegmentData: (segmentData) => set({ segmentData }),
  setTrafficStatus: (trafficStatus) => set({ trafficStatus }),
  setCorridorOptions: (corridorOptions) => set({ corridorOptions }),
  setAlerts: (alerts) => set({ alerts }),
  selectSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      segmentData: null,
      trafficStatus: [],
      corridorOptions: [],
      alerts: [],
      selectedSegmentId: null,
      isLoading: false,
      error: null,
    }),
}))
