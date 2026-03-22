import { IncidentAlertWidget, IncidentLayer, WeatherLayer } from '@/components'
import { ErrorState, Loading } from '@/components/common'
import { TrafficMap } from '@/components/map/TrafficMap'
import { CCTVModal } from '@/components/widgets/CCTVModal'
import { KPIBar } from '@/components/widgets/KPIBar'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { useSegments } from '@/hooks/useTraffic'
import { mapApi, weatherApi } from '@/services/api'
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
  const [segmentStatusLayerEnabled, setSegmentStatusLayerEnabled] =
    useState(true)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [weatherLayerEnabled, setWeatherLayerEnabled] = useState(false)
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

  const { data: weatherSegmentsResponse, isLoading: _weatherSegmentsLoading } =
    useQuery({
      queryKey: ['weather-segments'],
      queryFn: async () => weatherApi.getSegments(),
      refetchInterval: 600000, // Increased from 300s to 10 minutes for better performance
      refetchIntervalInBackground: true,
      staleTime: 300000, // Cache for 5 minutes
    })

  const weatherSegments =
    weatherSegmentsResponse?.success &&
    weatherSegmentsResponse?.data?.type === 'FeatureCollection'
      ? weatherSegmentsResponse.data
      : null

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

  const handleSegmentStatusToggle = (_enabled: boolean) => {
    setSegmentStatusLayerEnabled(_enabled)
  }

  const handleHeatmapToggle = (_enabled: boolean) => {
    // Heatmap toggle handler
    setHeatmapEnabled(_enabled)
  }

  const handleWeatherToggle = (_enabled: boolean) => {
    // Weather layer toggle handler
    setWeatherLayerEnabled(_enabled)
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
          segmentStatusLayerEnabled={segmentStatusLayerEnabled}
          heatmapEnabled={heatmapEnabled}
        >
          {/* Weather Layer - Displays areas colored by weather with icons */}
          {weatherLayerEnabled && (
            <WeatherLayer
              weatherSegments={weatherSegments}
              isLoading={_weatherSegmentsLoading}
            />
          )}
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
          onSegmentStatusToggle={handleSegmentStatusToggle}
          onHeatmapToggle={handleHeatmapToggle}
          onWeatherToggle={handleWeatherToggle}
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
