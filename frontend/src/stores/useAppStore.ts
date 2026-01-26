// Global App Store (Zustand)

import { create } from 'zustand'
import { Segment, TrafficStatus, Alert } from '@/types'

interface AppStore {
  // State
  segments: Segment[]
  trafficStatus: TrafficStatus[]
  alerts: Alert[]
  selectedSegmentId: number | null
  isLoading: boolean
  error: string | null

  // Actions
  setSegments: (segments: Segment[]) => void
  setTrafficStatus: (status: TrafficStatus[]) => void
  setAlerts: (alerts: Alert[]) => void
  selectSegment: (segmentId: number | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  // Initial State
  segments: [],
  trafficStatus: [],
  alerts: [],
  selectedSegmentId: null,
  isLoading: false,
  error: null,

  // Actions
  setSegments: (segments) => set({ segments }),
  setTrafficStatus: (trafficStatus) => set({ trafficStatus }),
  setAlerts: (alerts) => set({ alerts }),
  selectSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      segments: [],
      trafficStatus: [],
      alerts: [],
      selectedSegmentId: null,
      isLoading: false,
      error: null,
    }),
}))
