import { Loading } from '@/components'
import { RoutingMapboxLayer } from '@/components/map/RoutingMapboxLayer'
import { TrafficMap } from '@/components/map/TrafficMap'
import WeatherVoronoiLayer from '@/components/map/WeatherVoronoiLayer'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { RoutingPanel } from '@/components/widgets/RoutingPanel'
import { simulationApi } from '@/services/api'
import { PlaceSearchResult } from '@/types'
import { useAuth, useUser } from '@clerk/clerk-react'
import { message } from 'antd'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Marker } from 'react-map-gl'
import { DashboardPage } from './DashboardPage'

const RealTimeMapOnly: React.FC = () => {
  const MY_LOCATION_LABEL = 'Vị trí của tôi'
  const segmentData = null
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
  const apiOrigin = useMemo(() => {
    try {
      return new URL(apiBaseUrl, window.location.origin).origin
    } catch {
      return window.location.origin
    }
  }, [apiBaseUrl])
  const tomTomTileProxyUrl = `${apiOrigin}/api/traffic/tiles/{z}/{x}/{y}.pbf`
  const tomTomIncidentTileProxyUrl = `${apiOrigin}/api/traffic/incidents/{z}/{x}/{y}.pbf`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)

  const [segmentStatusLayerEnabled, setSegmentStatusLayerEnabled] =
    useState(true)
  const [weatherLayerEnabled, setWeatherLayerEnabled] = useState(false)
  const [weatherLayerLoading, setWeatherLayerLoading] = useState(false)
  const [incidentLayerEnabled, setIncidentLayerEnabled] = useState(true)

  // Routing states
  const [routingLayerEnabled, setRoutingLayerEnabled] = useState(false)
  const [routingStartPoint, setRoutingStartPoint] = useState<string>('')
  const [routingEndPoint, setRoutingEndPoint] = useState<string>('')
  const [rawStartPos, setRawStartPos] = useState<[number, number] | null>(null)
  const [rawEndPos, setRawEndPos] = useState<[number, number] | null>(null)

  const [routingDataGeoJSON, setRoutingDataGeoJSON] =
    useState<GeoJSON.FeatureCollection | null>(null)
  const [isRoutingLoading, setIsRoutingLoading] = useState(false)
  const [shouldAutoRoute, setShouldAutoRoute] = useState(false)
  const [activeRoutingInput, setActiveRoutingInput] = useState<'start' | 'end'>(
    'start'
  )

  const handleGetCurrentLocation = useCallback(
    (target: 'start' | 'end') => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords

            if (target === 'start') {
              setRoutingStartPoint(MY_LOCATION_LABEL)
              setRawStartPos([longitude, latitude])
              setActiveRoutingInput('end')
            } else {
              setRoutingEndPoint(MY_LOCATION_LABEL)
              setRawEndPos([longitude, latitude])
            }

            setShouldAutoRoute(true)
            message.success('Đã lấy vị trí hiện tại')
          },
          (error) => {
            console.warn('Geolocation error', error)
            message.error(
              'Không thể lấy vị trí hiện tại. Vui lòng kiểm tra quyền truy cập.'
            )
          }
        )
      }
    },
    [MY_LOCATION_LABEL]
  )

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
            setRoutingStartPoint(MY_LOCATION_LABEL)
            setRawStartPos([
              position.coords.longitude,
              position.coords.latitude,
            ])
            setActiveRoutingInput('end')
          },
          (error) => {
            console.warn('Geolocation disabled or denied', error)
          }
        )
      }
    }
  }, [MY_LOCATION_LABEL, routingLayerEnabled, routingStartPoint])

  const handleComputeRoute = useCallback(async () => {
    try {
      let startLat, startLng, endLat, endLng

      if (rawStartPos) {
        ;[startLng, startLat] = rawStartPos
      } else {
        ;[startLat, startLng] = routingStartPoint
          .split(',')
          .map((s) => parseFloat(s.trim()))
      }

      if (rawEndPos) {
        ;[endLng, endLat] = rawEndPos
      } else {
        ;[endLat, endLng] = routingEndPoint
          .split(',')
          .map((s) => parseFloat(s.trim()))
      }

      if (
        isNaN(startLat) ||
        isNaN(startLng) ||
        isNaN(endLat) ||
        isNaN(endLng)
      ) {
        message.warning('Vui lòng chọn hoặc nhập toạ độ hợp lệ')
        return
      }

      setIsRoutingLoading(true)
      const response = await simulationApi.getDynamicRoute(
        startLat,
        startLng,
        endLat,
        endLng
      )
      if (response.success && response.data) {
        setRoutingDataGeoJSON(response.data)
        message.success('Tìm đường thành công')
      } else {
        message.error('Không tìm thấy đường đi hoặc cung đường quá ngắn')
      }
    } catch (error: unknown) {
      console.error('Routing computed error', error)
      const axiosLikeError = error as {
        response?: { data?: { message?: string } }
      }
      message.error(
        axiosLikeError?.response?.data?.message || 'Có lỗi khi tìm lộ trình'
      )
    } finally {
      setIsRoutingLoading(false)
    }
  }, [rawEndPos, rawStartPos, routingEndPoint, routingStartPoint])

  const handlePlaceSelect = useCallback(
    (target: 'start' | 'end', place: PlaceSearchResult) => {
      if (target === 'start') {
        setRoutingStartPoint(place.name)
        setRawStartPos([place.lon, place.lat])
        setActiveRoutingInput('end')
      } else {
        setRoutingEndPoint(place.name)
        setRawEndPos([place.lon, place.lat])
      }

      setShouldAutoRoute(true)
      message.success(`Đã chọn: ${place.name}`)
    },
    []
  )

  useEffect(() => {
    if (
      !routingLayerEnabled ||
      !shouldAutoRoute ||
      !rawStartPos ||
      !rawEndPos
    ) {
      return
    }

    setShouldAutoRoute(false)
    void handleComputeRoute()
  }, [
    handleComputeRoute,
    rawEndPos,
    rawStartPos,
    routingLayerEnabled,
    shouldAutoRoute,
  ])

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

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <TrafficMap
        segmentData={segmentData}
        style={{ height: '100%', width: '100%' }}
        mapRef={mapRef}
        segmentStatusLayerEnabled={segmentStatusLayerEnabled}
        useTomTomFlowTiles
        tomTomFlowTilesUrl={tomTomTileProxyUrl}
        useTomTomIncidentTiles={incidentLayerEnabled}
        tomTomIncidentTilesUrl={tomTomIncidentTileProxyUrl}
        onMapClick={handleMapClickForRouting}
      >
        {weatherLayerEnabled && (
          <WeatherVoronoiLayer
            visible={weatherLayerEnabled}
            mapRef={mapRef}
            onLoadingChange={setWeatherLayerLoading}
          />
        )}

        {routingLayerEnabled && (
          <RoutingMapboxLayer
            routeGeoJSON={routingDataGeoJSON}
            rawStart={rawStartPos}
            rawEnd={rawEndPos}
          />
        )}

        {routingLayerEnabled && rawStartPos && (
          <Marker
            longitude={rawStartPos[0]}
            latitude={rawStartPos[1]}
            anchor="bottom"
          >
            <div
              style={{
                cursor: 'pointer',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 21L12 21.01M12 12C10.3431 12 9 10.6569 9 9C9 7.34315 10.3431 6 12 6C13.6569 6 15 7.34315 15 9C15 10.6569 13.6569 12 12 12ZM12 2C8.13401 2 5 5.13401 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13401 15.866 2 12 2Z"
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </Marker>
        )}

        {routingLayerEnabled && rawEndPos && (
          <Marker
            longitude={rawEndPos[0]}
            latitude={rawEndPos[1]}
            anchor="bottom"
          >
            <div
              style={{
                cursor: 'pointer',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 21L12 21.01M12 12C10.3431 12 9 10.6569 9 9C9 7.34315 10.3431 6 12 6C13.6569 6 15 7.34315 15 9C15 10.6569 13.6569 12 12 12ZM12 2C8.13401 2 5 5.13401 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13401 15.866 2 12 2Z"
                  fill="#ef4444"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
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
        onStartChange={(value) => {
          setRoutingStartPoint(value)
          setRawStartPos(null)
          setRoutingDataGeoJSON(null)
        }}
        onEndChange={(value) => {
          setRoutingEndPoint(value)
          setRawEndPos(null)
          setRoutingDataGeoJSON(null)
        }}
        onStartPlaceSelect={(place) => handlePlaceSelect('start', place)}
        onEndPlaceSelect={(place) => handlePlaceSelect('end', place)}
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
          setShouldAutoRoute(true)
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
