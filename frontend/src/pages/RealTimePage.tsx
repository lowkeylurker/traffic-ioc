// Real-Time Operations Page

import React, { useState, useRef } from 'react'
import { TrafficMap } from '@/components/map/TrafficMap'
import { IncidentLayer } from '@/components/map/IncidentLayer'
import { IncidentAlertWidget } from '@/components/widgets/IncidentAlertWidget'
import { KPIBar } from '@/components/widgets/KPIBar'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { CCTVModal } from '@/components/widgets/CCTVModal'
import { Loading, ErrorState } from '@/components/common'
import { useSegments, useTrafficStatus } from '@/hooks/useTraffic'
import { useAppStore } from '@/stores/useAppStore'
import { IncidentFeature } from '@/types'

export const RealTimePage: React.FC = () => {
  const segments = useSegments()
  const trafficStatus = useTrafficStatus()
  const { isLoading, error } = useAppStore()
  const [cctvModalVisible, setCCTVModalVisible] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [selectedIncident, setSelectedIncident] =
    useState<IncidentFeature | null>(null)

  // Map control handlers
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomTo(mapRef.current.getZoom() + 1, { duration: 300 })
    }
  }

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomTo(mapRef.current.getZoom() - 1, { duration: 300 })
    }
  }

  const handleCompassReset = () => {
    if (mapRef.current) {
      mapRef.current.easeTo({
        bearing: 0,
        pitch: 0,
        duration: 500,
      })
    }
  }

  const handleHeatmapToggle = (_enabled: boolean) => {
    // Heatmap toggle handler
    setHeatmapEnabled(_enabled)
  }

  if (isLoading && segments.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
        }}
      >
        <Loading />
      </div>
    )
  }

  if (error && segments.length === 0) {
    return <ErrorState message={error} />
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        gap: 0,
      }}
    >
      {/* Main Map Area - Left Side */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          borderRadius: 8,
          boxShadow:
            '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
        }}
      >
        {/* Main Map - Full Coverage */}
        <TrafficMap
          segments={segments}
          trafficStatus={trafficStatus}
          style={{ height: '100%', width: '100%' }}
          mapRef={mapRef}
          heatmapEnabled={heatmapEnabled}
        >
          {/* Incident Layer - Overlaid on traffic map */}
          <IncidentLayer onIncidentClick={setSelectedIncident} />
        </TrafficMap>

        {/* Floating Widgets - Z-Index Layering */}

        {/* Top KPI Bar (z-index: 20) */}
        <KPIBar />

        {/* Bottom Right - Map Controls (z-index: 10) */}
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onCompass={handleCompassReset}
          onCamera={() => setCCTVModalVisible(true)}
          onHeatmapToggle={handleHeatmapToggle}
        />

        {/* Bottom Right - Map Legend (z-index: 10) */}
        <MapLegend />

        {/* CCTV Modal (Hidden by default) */}
        <CCTVModal
          visible={cctvModalVisible}
          onClose={() => setCCTVModalVisible(false)}
        />
      </div>

      {/* Right Sidebar - Incident Alert Widget */}
      <IncidentAlertWidget
        onIncidentClick={setSelectedIncident}
        mapRef={mapRef}
      />
    </div>
  )
}
