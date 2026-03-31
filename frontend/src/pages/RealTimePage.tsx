import { IncidentAlertWidget, IncidentLayer } from '@/components'
import { ErrorState, Loading } from '@/components/common'
import IncidentImpactLayer from '@/components/map/IncidentImpactLayer'
import { TrafficMap } from '@/components/map/TrafficMap'
import WeatherVoronoiLayer from '@/components/map/WeatherVoronoiLayer'
import { CCTVModal } from '@/components/widgets/CCTVModal'
import { KPIBar } from '@/components/widgets/KPIBar'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { useTrafficMap } from '@/hooks/useTraffic'
import { mapApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'
import {
  GeoJSONFeature,
  IncidentCollection,
  IncidentFeature,
  IncidentImpactResponse,
} from '@/types'
import { Spin } from 'antd'
import { useQuery } from '@tanstack/react-query'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

export const RealTimePage: React.FC = () => {
  const segmentData = useTrafficMap()
  const location = useLocation()
  const { error } = useAppStore()
  const [cctvModalVisible, setCCTVModalVisible] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [segmentStatusLayerEnabled, setSegmentStatusLayerEnabled] =
    useState(true)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [weatherLayerEnabled, setWeatherLayerEnabled] = useState(false)
  const [weatherLayerLoading, setWeatherLayerLoading] = useState(false)
  const [incidentLayerEnabled, setIncidentLayerEnabled] = useState(false)
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
    refetchInterval: selectedIncident?.properties?.id ? 30000 : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })

  const impactedSegments = impactResponse?.impactedSegments ?? []

  const activeJamsCount = useMemo(() => {
    if (!segmentData?.features?.length) return 0

    return segmentData.features.reduce(
      (count: number, feature: GeoJSONFeature) => {
        const los = String(feature?.properties?.losIndex ?? '').toUpperCase()
        return los === 'E' || los === 'F' ? count + 1 : count
      },
      0
    )
  }, [segmentData])

  const jamSegments = useMemo(() => {
    if (!segmentData?.features?.length) return []

    return segmentData.features.filter((feature: GeoJSONFeature) => {
      const los = String(feature?.properties?.losIndex ?? '').toUpperCase()
      return los === 'E' || los === 'F'
    })
  }, [segmentData])

  const getSegmentCenter = (segment: GeoJSONFeature) => {
    const coords = segment.geometry.coordinates
    if (!coords || coords.length === 0) {
      return null
    }

    const centerIdx = Math.floor(coords.length / 2)
    const [lng, lat] = coords[centerIdx]
    return { lng, lat }
  }

  const handleSegmentClick = (segment: GeoJSONFeature, zoom = 16) => {
    if (!mapRef.current?.getMap) return

    const map = mapRef.current.getMap()
    const center = getSegmentCenter(segment)
    if (!center) return

    // Fly to the segment
    map.flyTo({
      center: [center.lng, center.lat],
      zoom,
      duration: 1000,
    })
  }

  const handleRoadFocus = (segments: GeoJSONFeature[]) => {
    if (segments.length === 0) {
      return
    }

    const centers = segments
      .map((segment) => ({
        segment,
        center: getSegmentCenter(segment),
      }))
      .filter(
        (
          item
        ): item is {
          segment: GeoJSONFeature
          center: { lng: number; lat: number }
        } => item.center !== null
      )

    if (centers.length === 0) {
      return
    }

    const centroid = centers.reduce(
      (acc, item) => ({
        lng: acc.lng + item.center.lng,
        lat: acc.lat + item.center.lat,
      }),
      { lng: 0, lat: 0 }
    )

    centroid.lng /= centers.length
    centroid.lat /= centers.length

    const representative = centers.reduce((best, current) => {
      const bestDistance =
        (best.center.lng - centroid.lng) ** 2 +
        (best.center.lat - centroid.lat) ** 2
      const currentDistance =
        (current.center.lng - centroid.lng) ** 2 +
        (current.center.lat - centroid.lat) ** 2
      return currentDistance < bestDistance ? current : best
    })

    handleSegmentClick(representative.segment, 15)
  }

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
    if (!_enabled) {
      setWeatherLayerLoading(false)
    }
  }

  const handleIncidentToggle = (_enabled: boolean) => {
    setIncidentLayerEnabled(_enabled)
    if (!_enabled) {
      setSelectedIncident(null)
    }
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
        (feature: GeoJSONFeature) => feature.properties.roadKey === roadKey
      )

      if (roadSegments.length > 0) {
        handleRoadFocus(roadSegments)
      }

      lastHandledDeepLinkRef.current = location.search
      return
    }

    lastHandledDeepLinkRef.current = location.search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, segmentData])

  if (!segmentData || segmentData.features.length === 0) {
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
          {/* Weather Layer - Displays weather Voronoi polygons */}
          {weatherLayerEnabled && (
            <WeatherVoronoiLayer
              visible={weatherLayerEnabled}
              mapRef={mapRef}
              onLoadingChange={setWeatherLayerLoading}
            />
          )}
          {/* Incident Layer - Overlaid on traffic map */}
          {incidentLayerEnabled && (
            <IncidentLayer
              incidents={incidents}
              isLoading={incidentsLoading}
              onIncidentClick={setSelectedIncident}
              mapRef={mapRef}
            />
          )}

          <IncidentImpactLayer
            visible={
              incidentLayerEnabled &&
              Boolean(selectedIncident) &&
              impactedSegments.length > 0
            }
            segments={impactedSegments}
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
          <KPIBar
            incidentCount={incidents.length}
            activeJams={activeJamsCount}
            jamSegments={jamSegments}
            onSegmentClick={handleSegmentClick}
          />
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
          onIncidentToggle={handleIncidentToggle}
        />

        {/* Bottom Right - Map Legend (z-index: 10) */}
        <MapLegend />

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
              <Spin size="small" />
              Đang tải lớp thời tiết...
            </div>
          </div>
        )}

        {/* CCTV Modal (Hidden by default) */}
        <CCTVModal
          visible={cctvModalVisible}
          onClose={() => setCCTVModalVisible(false)}
        />

        {/* Floating Right Stack Widgets */}
        {incidentLayerEnabled && (
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
                overflow: 'hidden',
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
        )}

        {incidentLayerEnabled && selectedIncident && (
          <div
            style={{
              position: 'absolute',
              bottom: 84,
              left: 12,
              zIndex: 26,
              pointerEvents: 'none',
              minWidth: 280,
              maxWidth: 380,
            }}
          >
            <div
              style={{
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(15, 23, 42, 0.78)',
                color: '#F8FAFC',
                padding: '12px 14px',
                boxShadow: '0 12px 28px rgba(2,6,23,0.28)',
                pointerEvents: 'auto',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  Vết loang kẹt xe
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedIncident(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#CBD5E1',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0,
                  }}
                  title="Tắt vết loang"
                >
                  ×
                </button>
              </div>

              {impactLoading && (
                <div style={{ fontSize: 12, color: '#CBD5E1' }}>
                  Đang phân tích vùng ảnh hưởng...
                </div>
              )}

              {!impactLoading && impactError && (
                <div style={{ fontSize: 12, color: '#FECACA' }}>
                  Không lấy được dữ liệu vết loang. Vui lòng thử lại.
                </div>
              )}

              {!impactLoading &&
                !impactError &&
                impactedSegments.length === 0 && (
                  <div style={{ fontSize: 12, color: '#E2E8F0' }}>
                    Chưa ghi nhận vết loang đáng kể trong bán kính hiện tại.
                  </div>
                )}

              {!impactLoading &&
                !impactError &&
                impactedSegments.length > 0 &&
                impactResponse && (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '8px 10px',
                        fontSize: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        Đoạn đường:{' '}
                        <b>{impactResponse.summary.totalImpactedSegments}</b>
                      </div>
                      <div>
                        Chiều dài:{' '}
                        <b>
                          {impactResponse.summary.impactedLengthKm.toFixed(2)}{' '}
                          km
                        </b>
                      </div>
                      <div>
                        Hàng đợi xa nhất:{' '}
                        <b>
                          {impactResponse.summary.maxQueueDistanceKm.toFixed(2)}{' '}
                          km
                        </b>
                      </div>
                      <div>
                        Mức độ nghiêm trọng:{' '}
                        <b>{impactResponse.summary.severityScore}</b>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: '#CBD5E1' }}>
                      Legend: <span style={{ color: '#FB7185' }}>CRITICAL</span>{' '}
                      / <span style={{ color: '#F97316' }}>HIGH</span> /{' '}
                      <span style={{ color: '#FB923C' }}>MEDIUM</span> /{' '}
                      <span style={{ color: '#F59E0B' }}>LOW</span>
                    </div>
                  </>
                )}
            </div>
          </div>
        )}

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
