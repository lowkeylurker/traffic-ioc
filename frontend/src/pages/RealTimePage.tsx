import { Loading } from '@/components'
import IncidentImpactLayer from '@/components/map/IncidentImpactLayer'
import { IncidentLayer } from '@/components/map/IncidentLayer'
import { TrafficMap } from '@/components/map/TrafficMap'
import { RoutingMapboxLayer } from '@/components/map/RoutingMapboxLayer'
import WeatherVoronoiLayer from '@/components/map/WeatherVoronoiLayer'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { RoutingPanel } from '@/components/widgets/RoutingPanel'
import { POLLING_INTERVALS } from '@/config/constants'
import { useTrafficMap } from '@/hooks/useTraffic'
import { mapApi, simulationApi } from '@/services/api'
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
import { message } from 'antd'
import { Marker } from 'react-map-gl'
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

  // Routing states
  const [routingLayerEnabled, setRoutingLayerEnabled] = useState(false)
  const [routingStartPoint, setRoutingStartPoint] = useState<string>('')
  const [routingEndPoint, setRoutingEndPoint] = useState<string>('')
  const [rawStartPos, setRawStartPos] = useState<[number, number] | null>(null)
  const [rawEndPos, setRawEndPos] = useState<[number, number] | null>(null)
  
  const [routingDataGeoJSON, setRoutingDataGeoJSON] = useState<any>(null)
  const [isRoutingLoading, setIsRoutingLoading] = useState(false)
  const [activeRoutingInput, setActiveRoutingInput] = useState<'start'|'end'>('start')

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          const coordStr = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          setRoutingStartPoint(coordStr)
          setRawStartPos([longitude, latitude])
          message.success('Đã lấy vị trí hiện tại')
        },
        (error) => {
          console.warn('Geolocation error', error)
          message.error('Không thể lấy vị trí hiện tại. Vui lòng kiểm tra quyền truy cập.')
        }
      )
    }
  }

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

  // Routing Effect to get current location
  useEffect(() => {
    if (routingLayerEnabled && !routingStartPoint) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setRoutingStartPoint(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`)
          },
          (error) => {
            console.warn('Geolocation disabled or denied', error)
          }
        )
      }
    }
  }, [routingLayerEnabled, routingStartPoint])

  const handleComputeRoute = async () => {
    try {
      let startLat, startLng, endLat, endLng;

      if (rawStartPos) {
        [startLng, startLat] = rawStartPos;
      } else {
        [startLat, startLng] = routingStartPoint.split(',').map((s) => parseFloat(s.trim()));
      }

      if (rawEndPos) {
        [endLng, endLat] = rawEndPos;
      } else {
        [endLat, endLng] = routingEndPoint.split(',').map((s) => parseFloat(s.trim()));
      }

      if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
        message.warning('Vui lòng chọn hoặc nhập toạ độ hợp lệ')
        return
      }

      setIsRoutingLoading(true)
      const response = await simulationApi.getDynamicRoute(startLat, startLng, endLat, endLng)
      if (response.success && response.data) {
        setRoutingDataGeoJSON(response.data)
        message.success('Tìm đường thành công')
      } else {
        message.error('Không tìm thấy đường đi hoặc cung đường quá ngắn')
      }
    } catch (error: any) {
      console.error('Routing computed error', error)
      message.error(error?.response?.data?.message || 'Có lỗi khi tìm lộ trình')
    } finally {
      setIsRoutingLoading(false)
    }
  }

  const handleMapClickForRouting = (event: mapboxgl.MapLayerMouseEvent) => {
    if (!routingLayerEnabled) return
    const { lng, lat } = event.lngLat
    const coordStr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    if (activeRoutingInput === 'start') {
      setRoutingStartPoint(coordStr)
      setRawStartPos([lng, lat])
      setActiveRoutingInput('end')
    } else {
      setRoutingEndPoint(coordStr)
      setRawEndPos([lng, lat])
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
        onMapClick={handleMapClickForRouting}
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
        
        {routingLayerEnabled && (
          <RoutingMapboxLayer 
          routeGeoJSON={routingDataGeoJSON} 
          rawStart={rawStartPos}
          rawEnd={rawEndPos}
        />
        )}

        {routingLayerEnabled && rawStartPos && (
          <Marker longitude={rawStartPos[0]} latitude={rawStartPos[1]} anchor="bottom">
            <div style={{ cursor: 'pointer', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21L12 21.01M12 12C10.3431 12 9 10.6569 9 9C9 7.34315 10.3431 6 12 6C13.6569 6 15 7.34315 15 9C15 10.6569 13.6569 12 12 12ZM12 2C8.13401 2 5 5.13401 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13401 15.866 2 12 2Z" 
                  fill="#3b82f6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </Marker>
        )}

        {routingLayerEnabled && rawEndPos && (
          <Marker longitude={rawEndPos[0]} latitude={rawEndPos[1]} anchor="bottom">
            <div style={{ cursor: 'pointer', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21L12 21.01M12 12C10.3431 12 9 10.6569 9 9C9 7.34315 10.3431 6 12 6C13.6569 6 15 7.34315 15 9C15 10.6569 13.6569 12 12 12ZM12 2C8.13401 2 5 5.13401 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13401 15.866 2 12 2Z" 
                  fill="#ef4444" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </Marker>
        )}
      </TrafficMap>

      <RoutingPanel 
        visible={routingLayerEnabled}
        startPoint={routingStartPoint}
        endPoint={routingEndPoint}
        loading={isRoutingLoading}
        activeInput={activeRoutingInput}
        routeGeoJSON={routingDataGeoJSON}
        onStartChange={setRoutingStartPoint}
        onEndChange={setRoutingEndPoint}
        onActiveInputSet={setActiveRoutingInput}
        onComputeRoute={handleComputeRoute}
        onGetCurrentLocation={handleGetCurrentLocation}
        onClose={() => {
          setRoutingLayerEnabled(false)
          setRoutingDataGeoJSON(null)
        }}
        onSwap={() => {
          const sText = routingStartPoint
          const sRaw = rawStartPos
          setRoutingStartPoint(routingEndPoint)
          setRawStartPos(rawEndPos)
          setRoutingEndPoint(sText)
          setRawEndPos(sRaw)
        }}
      />

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
        onRoutingToggle={(enabled) => {
          setRoutingLayerEnabled(enabled)
          if (!enabled) setRoutingDataGeoJSON(null)
        }}
        showCamera={false}
        defaultSegmentStatusLayerEnabled={segmentStatusLayerEnabled}
        defaultWeatherLayerEnabled={weatherLayerEnabled}
        defaultIncidentLayerEnabled={incidentLayerEnabled}
      />

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
