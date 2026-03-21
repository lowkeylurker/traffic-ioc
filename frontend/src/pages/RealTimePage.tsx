import { IncidentAlertWidget, IncidentLayer, WeatherWidget } from '@/components'
import { ErrorState, Loading } from '@/components/common'
import { TrafficMap } from '@/components/map/TrafficMap'
import { CCTVModal } from '@/components/widgets/CCTVModal'
import { KPIBar } from '@/components/widgets/KPIBar'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { useSegments } from '@/hooks/useTraffic'
import { mapApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'
import { IncidentCollection, IncidentFeature } from '@/types'
import { useQuery } from '@tanstack/react-query'
import React, { useRef, useState } from 'react'

export const RealTimePage: React.FC = () => {
  const segmentData = useSegments()
  const { isLoading, error } = useAppStore()
  const [cctvModalVisible, setCCTVModalVisible] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [_selectedIncident, setSelectedIncident] =
    useState<IncidentFeature | null>(null)

  // const getCurrentBbox = (): string | undefined => {
  //   const mapObj = mapRef.current as {
  //     getMap?: () => {
  //       getBounds?: () => {
  //         getWest: () => number
  //         getSouth: () => number
  //         getEast: () => number
  //         getNorth: () => number
  //       }
  //     }
  //   } | null

  //   const bounds = mapObj?.getMap?.()?.getBounds?.()
  //   if (!bounds) return undefined

  //   return `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`
  // }

  const { data: incidentData, isLoading: incidentsLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async (): Promise<IncidentCollection> => {
      // const bbox = getCurrentBbox()
      const response = await mapApi.getIncidents('OPEN')

      if (response?.success && response?.data?.type === 'FeatureCollection') {
        return response.data
      }

      return { type: 'FeatureCollection', features: [] }
    },
    refetchInterval: 180000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  })

  const incidents = incidentData?.features || []

  // const handleAlertClick = (clickedAlert: Alert) => {
  //   const originalIncident = incidents.find((inc) => inc.id === clickedAlert.id)
  //   if (originalIncident && mapRef.current) {
  //     const [lng, lat] = originalIncident.geometry.coordinates
  //     mapRef.current.flyTo({
  //       center: [lng, lat],
  //       zoom: 16,
  //       duration: 1500,
  //       essential: true,
  //     })
  //     setSelectedIncident(originalIncident)
  //   }
  // }

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

  if (isLoading && !segmentData) {
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

  if (error && !segmentData) {
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
          segmentData={segmentData}
          style={{ height: '100%', width: '100%' }}
          mapRef={mapRef}
          heatmapEnabled={heatmapEnabled}
        >
          {/* Incident Layer - Overlaid on traffic map */}
          <IncidentLayer
            incidents={incidents}
            isLoading={incidentsLoading}
            onIncidentClick={setSelectedIncident}
            mapRef={mapRef}
          />
        </TrafficMap>

        {/* Floating Widgets - Z-Index Layering */}

        {/* Top KPI Bar (z-index: 20) */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 'clamp(280px, 26vw, 350px)',
            maxWidth: 980,
            zIndex: 25,
            animation: 'dashboard-fade-slide 380ms ease-out both',
          }}
        >
          <KPIBar />
        </div>

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

        {/* Floating Right Stack Widgets */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 'clamp(260px, 24vw, 330px)',
            animation: 'dashboard-fade-slide 420ms ease-out both',
            animationDelay: '80ms',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            zIndex: 20,
            maxHeight: 'calc(100% - 168px)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              pointerEvents: 'auto',
              maxHeight: '48vh',
              overflowY: 'auto',
              borderRadius: 12,
              animation: 'dashboard-fade-slide 420ms ease-out both',
              animationDelay: '120ms',
            }}
          >
            <IncidentAlertWidget
              incidents={incidents}
              isLoading={incidentsLoading}
              onIncidentClick={setSelectedIncident}
              mapRef={mapRef}
              floating={false}
            />
          </div>
          <div
            style={{
              pointerEvents: 'auto',
              maxHeight: '34vh',
              overflowY: 'auto',
              borderRadius: 12,
              animation: 'dashboard-fade-slide 420ms ease-out both',
              animationDelay: '180ms',
            }}
          >
            <WeatherWidget compact />
          </div>
        </div>

        <style>{`
          @keyframes dashboard-fade-slide {
            0% {
              opacity: 0;
              transform: translateY(10px) scale(0.99);
              filter: blur(2px);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
              filter: blur(0);
            }
          }
        `}</style>
      </div>
    </div>
  )
}
