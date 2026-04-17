import { Loading } from '@/components'
import IncidentImpactLayer from '@/components/map/IncidentImpactLayer'
import { IncidentLayer } from '@/components/map/IncidentLayer'
import { TrafficMap } from '@/components/map/TrafficMap'
import WeatherVoronoiLayer from '@/components/map/WeatherVoronoiLayer'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { POLLING_INTERVALS } from '@/config/constants'
import { useTrafficMap } from '@/hooks/useTraffic'
import { mapApi, userApi } from '@/services/api'
import { Space, Tooltip } from 'antd'
import {
  GeoJSONFeature,
  IncidentCollection,
  IncidentFeature,
  IncidentImpactResponse,
} from '@/types'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useQuery } from '@tanstack/react-query'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { DashboardPage } from './DashboardPage'

const getSegmentCenter = (segment: GeoJSONFeature) => {
  const coords = segment.geometry.coordinates
  if (!coords || coords.length === 0) {
    return null
  }

  const centerIdx = Math.floor(coords.length / 2)
  const [lng, lat] = coords[centerIdx]
  return { lng, lat }
}

const RealTimeMapOnly: React.FC = () => {
  const segmentData = useTrafficMap()
  const location = useLocation()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)

  const [segmentStatusLayerEnabled, setSegmentStatusLayerEnabled] =
    useState(true)
  const [weatherLayerEnabled, setWeatherLayerEnabled] = useState(false)
  const [weatherLayerLoading, setWeatherLayerLoading] = useState(false)
  const [incidentLayerEnabled, setIncidentLayerEnabled] = useState(true)
  const [selectedIncident, setSelectedIncident] =
    useState<IncidentFeature | null>(null)

  const lastHandledDeepLinkRef = useRef<string | null>(null)

  useEffect(() => {
    const contentEl = document.querySelector(
      '.ant-layout-content'
    ) as HTMLElement | null

    const prevContentOverflow = contentEl?.style.overflow
    const prevBodyOverflow = document.body.style.overflow

    if (contentEl) {
      contentEl.style.overflow = 'hidden'
    }
    document.body.style.overflow = 'hidden'

    return () => {
      if (contentEl) {
        contentEl.style.overflow = prevContentOverflow ?? ''
      }
      document.body.style.overflow = prevBodyOverflow
    }
  }, [])

  const { data: incidentData, isLoading: incidentsLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async (): Promise<IncidentCollection> => {
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

  // Gamification & Trust widget score
  const { data: userScore } = useQuery({
    queryKey: ['userScore'],
    queryFn: async () => {
      try {
        const response = await userApi.getScore()
        return response.data
      } catch {
        return { reputationScore: 0, trustWeight: 1.0 }
      }
    },
    staleTime: 60000,
    retry: false,
  })

  const {
    data: impactResponse,
    isLoading: impactLoading,
    isError: impactError,
  } = useQuery({
    queryKey: ['incident-impact-propagation', selectedIncident?.properties?.id],
    queryFn: async (): Promise<IncidentImpactResponse | null> => {
      if (!selectedIncident?.properties?.id) return null

      const response = await mapApi.getIncidentImpactPropagation(
        selectedIncident.properties.id,
        {
          radiusMeters: 2000,
          ttiThreshold: 1.5,
          maxDepth: 4,
          maxSegments: 200,
        }
      )

      if (response?.success && response?.data) {
        return response.data
      }

      return null
    },
    enabled: incidentLayerEnabled && Boolean(selectedIncident?.properties?.id),
    refetchInterval: selectedIncident?.properties?.id
      ? POLLING_INTERVALS.TRAFFIC_DATA
      : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })

  const impactedSegments = impactResponse?.impactedSegments ?? []

  const handleSegmentClick = (segment: GeoJSONFeature, zoom = 16) => {
    if (!mapRef.current?.getMap) return

    const map = mapRef.current.getMap()
    const center = getSegmentCenter(segment)
    if (!center) return

    map.flyTo({
      center: [center.lng, center.lat],
      zoom,
      duration: 1000,
    })
  }

  useEffect(() => {
    if (!segmentData?.features?.length) {
      return
    }

    if (!location.search) {
      return
    }

    if (lastHandledDeepLinkRef.current === location.search) {
      return
    }

    const params = new URLSearchParams(location.search)
    const segmentId = params.get('segmentId')
    const roadKey = params.get('roadKey')

    if (segmentId) {
      const selectedFeature = segmentData.features.find(
        (feature: GeoJSONFeature) =>
          String(feature.properties.segmentId) === segmentId
      )

      if (selectedFeature) {
        handleSegmentClick(selectedFeature)
      }

      lastHandledDeepLinkRef.current = location.search
      return
    }

    if (roadKey) {
      const roadSegments = segmentData.features.filter(
        (feature: GeoJSONFeature) =>
          String(feature.properties.roadKey) === roadKey
      )

      if (roadSegments.length > 0) {
        handleSegmentClick(roadSegments[0])
      }

      lastHandledDeepLinkRef.current = location.search
    }
  }, [location.search, segmentData])

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

  const showImpactOverlay = useMemo(() => {
    if (!incidentLayerEnabled) return false
    if (!selectedIncident) return false
    if (impactError) return false
    if (impactLoading) return false
    return impactedSegments.length > 0
  }, [
    impactError,
    impactLoading,
    impactedSegments.length,
    incidentLayerEnabled,
    selectedIncident,
  ])

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <TrafficMap
        segmentData={segmentData}
        style={{ height: '100%', width: '100%' }}
        mapRef={mapRef}
        segmentStatusLayerEnabled={segmentStatusLayerEnabled}
      >
        {weatherLayerEnabled && (
          <WeatherVoronoiLayer
            visible={weatherLayerEnabled}
            mapRef={mapRef}
            onLoadingChange={setWeatherLayerLoading}
          />
        )}

        {incidentLayerEnabled && (
          <IncidentLayer
            incidents={incidents}
            isLoading={incidentsLoading}
            onIncidentClick={setSelectedIncident}
            mapRef={mapRef}
            selectedIncident={selectedIncident}
            onSelectedIncidentChange={setSelectedIncident}
          />
        )}

        <IncidentImpactLayer
          visible={showImpactOverlay}
          segments={impactedSegments}
          mapRef={mapRef}
        />
      </TrafficMap>

      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onCompass={handleCompassReset}
        onSegmentStatusToggle={setSegmentStatusLayerEnabled}
        onWeatherToggle={setWeatherLayerEnabled}
        onIncidentToggle={(enabled) => {
          setIncidentLayerEnabled(enabled)
          if (!enabled) {
            setSelectedIncident(null)
          }
        }}
        showCamera={false}
        defaultSegmentStatusLayerEnabled={segmentStatusLayerEnabled}
        defaultWeatherLayerEnabled={weatherLayerEnabled}
        defaultIncidentLayerEnabled={incidentLayerEnabled}
      />

      <MapLegend />

      {/* Gamification Widget */}
      {userScore && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 30,
            background:
              'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.85) 100%)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: 16,
            padding: '8px 16px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#fcd34d',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Hiệp Sĩ Giao Thông
            </span>
            <Space align="center" size={6}>
              <span style={{ fontSize: '1.2rem' }}>🏆</span>
              <span
                style={{
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 18,
                  textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                }}
              >
                {userScore.reputationScore.toLocaleString()}
              </span>
            </Space>
          </div>

          <div
            style={{
              width: 1,
              height: 32,
              background: 'rgba(255,255,255,0.1)',
            }}
          />

          <Tooltip
            title={`Uy tín ẩn (Elo): ${userScore.trustWeight.toFixed(
              1
            )}. Tăng lên khi bạn xác nhận đúng sự cố.`}
            placement="bottom"
          >
            <div
              style={{
                cursor: 'help',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  filter: 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.6))',
                }}
              >
                🛡️
              </span>
            </div>
          </Tooltip>
        </div>
      )}

      {weatherLayerEnabled && weatherLayerLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.18)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#F8FAFC',
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 14px',
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.62)',
              border: '1px solid rgba(248, 250, 252, 0.18)',
              boxShadow: '0 10px 24px rgba(2, 6, 23, 0.25)',
            }}
          >
            Đang tải lớp thời tiết...
          </div>
        </div>
      )}
    </div>
  )
}

export const RealTimePage: React.FC = () => {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()

  if (!isLoaded) {
    return <Loading />
  }

  const userRole = (
    isSignedIn ? (user?.publicMetadata?.role as string | undefined) : undefined
  ) as string | undefined
  const isAdmin = userRole === 'admin'

  return isAdmin ? <DashboardPage /> : <RealTimeMapOnly />
}
