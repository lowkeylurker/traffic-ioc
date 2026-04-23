// Traffic Map Component

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  TRAFFIC_COLORS,
} from '@/config/constants'
import { GeoJSONFeature, SegmentResponse } from '@/types'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, LayerProps, MapRef, Source } from 'react-map-gl'

const MAX_RENDER_SEGMENTS = 12000
const MAX_FEATURES_FOR_AUTO_FIT = 50000
const MIN_RENDER_SEGMENTS = 2500
const TOMTOM_FLOW_TILE_MAX_ZOOM = 16

type MapBounds = {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

type HoveredTrafficFeature = GeoJSONFeature['properties'] & {
  trafficLevel?: number
  trafficIndex?: number
}

type TomTomSegmentDetail = {
  currentSpeed: number
  freeFlowSpeed: number
  trafficIndex: string
}

type TomTomHoverPopupState = {
  visible: boolean
  loading: boolean
  error: string | null
  detail: TomTomSegmentDetail | null
  title: string
}

const getLosFromTrafficIndex = (trafficIndex: number): string => {
  if (trafficIndex <= 0.15) return 'A'
  if (trafficIndex <= 0.3) return 'B'
  if (trafficIndex <= 0.45) return 'C'
  if (trafficIndex <= 0.6) return 'D'
  if (trafficIndex <= 0.8) return 'E'
  return 'F'
}

interface TrafficMapProps {
  segmentData: SegmentResponse | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trafficStatus?: any[] // Optional traffic status data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMapClick?: (event: any) => void
  style?: React.CSSProperties
  autoRefreshInterval?: number
  mapRef?: React.RefObject<MapRef>
  segmentStatusLayerEnabled?: boolean
  useTomTomFlowTiles?: boolean
  tomTomFlowTilesUrl?: string
  children?: React.ReactNode
}

export const TrafficMap: React.FC<TrafficMapProps> = ({
  segmentData,
  onMapClick,
  style,
  mapRef: externalMapRef,
  segmentStatusLayerEnabled = true,
  useTomTomFlowTiles = false,
  tomTomFlowTilesUrl,
  children,
}) => {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapboxStyle = import.meta.env.VITE_MAPBOX_STYLE
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
  const apiOrigin = useMemo(() => {
    try {
      return new URL(apiBaseUrl, window.location.origin).origin
    } catch {
      return window.location.origin
    }
  }, [apiBaseUrl])
  const internalMapRef = useRef<MapRef | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = externalMapRef || internalMapRef
  const [hoveredFeature, setHoveredFeature] =
    useState<HoveredTrafficFeature | null>(null)
  const [viewportBounds, setViewportBounds] = useState<MapBounds | null>(null)
  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_MAP_ZOOM)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })
  const [tomTomHoverPopup, setTomTomHoverPopup] =
    useState<TomTomHoverPopupState>({
      visible: false,
      loading: false,
      error: null,
      detail: null,
      title: '',
    })
  const hoverTimerRef = useRef<number | null>(null)
  const hoverAbortRef = useRef<AbortController | null>(null)
  const hoverSequenceRef = useRef(0)

  const renderCap = useMemo(() => {
    if (currentZoom < 11) return MIN_RENDER_SEGMENTS
    if (currentZoom < 12.5) return 5000
    if (currentZoom < 14) return 8000
    if (currentZoom < 15.5) return MAX_RENDER_SEGMENTS
    if (currentZoom < 17) return 18000
    return 26000
  }, [currentZoom])

  const featureBounds = useMemo(() => {
    if (!segmentData?.features?.length) return []

    return segmentData.features.map((feature) => {
      const coords = feature.geometry.coordinates
      let minLon = Infinity
      let maxLon = -Infinity
      let minLat = Infinity
      let maxLat = -Infinity

      coords.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon)
        maxLon = Math.max(maxLon, lon)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      })

      return { minLon, maxLon, minLat, maxLat }
    })
  }, [segmentData])

  const renderedSegmentData = useMemo(() => {
    if (!segmentData?.features?.length) return null

    if (!viewportBounds) {
      const featuresWithData = segmentData.features.filter(
        (f) => f.properties.losIndex && f.properties.losIndex !== 'N/A'
      )
      return {
        ...segmentData,
        features: featuresWithData.slice(0, renderCap),
      }
    }

    const visibleFeatures: GeoJSONFeature[] = []

    for (let i = 0; i < segmentData.features.length; i += 1) {
      const feature = segmentData.features[i]
      const los = feature.properties.losIndex

      if (!los || los === 'N/A') continue

      const bounds = featureBounds[i]
      if (!bounds) continue

      const intersectsViewport =
        bounds.maxLon >= viewportBounds.minLon &&
        bounds.minLon <= viewportBounds.maxLon &&
        bounds.maxLat >= viewportBounds.minLat &&
        bounds.minLat <= viewportBounds.maxLat

      if (intersectsViewport) {
        visibleFeatures.push(feature)
      }

      if (visibleFeatures.length >= renderCap) {
        break
      }
    }

    return {
      ...segmentData,
      features: visibleFeatures,
    }
  }, [featureBounds, renderCap, segmentData, viewportBounds])

  const updateViewportBounds = () => {
    if (!mapRef.current?.getMap) return

    const map = mapRef.current.getMap()
    const bounds = map.getBounds()

    if (!bounds) return

    setViewportBounds({
      minLon: bounds.getWest(),
      maxLon: bounds.getEast(),
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
    })
    setCurrentZoom(map.getZoom())
  }

  // Auto-fit map bounds when traffic data loads
  useEffect(() => {
    if (segmentData && segmentData.features.length > 0 && mapRef.current) {
      if (segmentData.features.length > MAX_FEATURES_FOR_AUTO_FIT) {
        return
      }

      const map = mapRef.current
      const bounds = segmentData.features.reduce(
        (acc, feature) => {
          const coords = feature.geometry.coordinates
          coords.forEach(([lon, lat]) => {
            acc.minLon = Math.min(acc.minLon, lon)
            acc.maxLon = Math.max(acc.maxLon, lon)
            acc.minLat = Math.min(acc.minLat, lat)
            acc.maxLat = Math.max(acc.maxLat, lat)
          })
          return acc
        },
        {
          minLon: Infinity,
          maxLon: -Infinity,
          minLat: Infinity,
          maxLat: -Infinity,
        }
      )

      if (map && bounds.minLon !== Infinity) {
        map.fitBounds(
          [
            [bounds.minLon, bounds.minLat],
            [bounds.maxLon, bounds.maxLat],
          ],
          { padding: 50, duration: 500 }
        )
      }
    }
    // mapRef is a ref object, its .current is checked but not included in dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentData])

  // Create traffic layer style
  const trafficLayerStyle = useMemo(
    () =>
      ({
        id: 'traffic-flow-layer',
        type: 'line',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],

            // Tại mức Zoom = 10
            10,
            [
              'case',
              ['==', ['get', 'isCorridor'], true],
              2.2, // Hành lang dày 2.2
              1.1, // Đường thường cũng dày 2.2
            ],

            // Tại mức Zoom = 14
            14,
            [
              'case',
              ['==', ['get', 'isCorridor'], true],
              3.8, // Hành lang dày lên 3.8
              1.9, // Đường thường thu nhỏ còn 1.9
            ],
          ],
          'line-color': [
            'case',
            ['==', ['get', 'losIndex'], 'N/A'],
            'rgba(0,0,0,0)',
            ['coalesce', ['get', 'color'], 'rgba(0,0,0,0)'],
          ],
          'line-opacity': ['case', ['==', ['get', 'losIndex'], 'N/A'], 0, 0.92],
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      }) as LayerProps,
    []
  )

  // Outline/Casing layer to increase contrast on street-v12 style
  const trafficOutlineLayerStyle = useMemo(
    () =>
      ({
        id: 'traffic-flow-outline-layer',
        type: 'line',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],

            10,
            ['case', ['==', ['get', 'isCorridor'], true], 3.2, 1.8],

            14,
            ['case', ['==', ['get', 'isCorridor'], true], 5.2, 3.0],
          ],
          'line-color': 'rgba(0, 0, 0, 0.35)',
          'line-opacity': ['case', ['==', ['get', 'losIndex'], 'N/A'], 0, 0.5],
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      }) as LayerProps,
    []
  )

  const tomTomFlowLayerStyle = useMemo(
    () =>
      ({
        id: 'tomtom-traffic-flow-layer',
        type: 'line',
        source: 'tomtom-flow-source',
        'source-layer': 'Traffic flow',
        paint: {
          // Quy doi theo data-pipeline: traffic_index = 1 - traffic_level
          // Nguong LOS (HCM 2010): A<=0.15, B<=0.30, C<=0.45, D<=0.60, E<=0.80, F>0.80
          'line-color': [
            'let',
            'trafficIndex',
            ['-', 1, ['to-number', ['coalesce', ['get', 'traffic_level'], 0]]],
            [
              'case',
              ['<=', ['var', 'trafficIndex'], 0.15],
              TRAFFIC_COLORS.MINIMAL,
              ['<=', ['var', 'trafficIndex'], 0.3],
              TRAFFIC_COLORS.VERY_LOW,
              ['<=', ['var', 'trafficIndex'], 0.45],
              TRAFFIC_COLORS.MODERATE,
              ['<=', ['var', 'trafficIndex'], 0.6],
              TRAFFIC_COLORS.HIGH,
              ['<=', ['var', 'trafficIndex'], 0.8],
              TRAFFIC_COLORS.VERY_HIGH,
              TRAFFIC_COLORS.EXTREME,
            ],
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            3,
            12,
            4,
            16,
            5,
          ],
          'line-opacity': 0.95,
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      }) as LayerProps,
    []
  )

  const clearTomTomHoverRequest = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }

    if (hoverAbortRef.current) {
      hoverAbortRef.current.abort()
      hoverAbortRef.current = null
    }
  }, [])

  const resetTomTomHoverPopup = useCallback(() => {
    clearTomTomHoverRequest()
    hoverSequenceRef.current += 1
    setTomTomHoverPopup({
      visible: false,
      loading: false,
      error: null,
      detail: null,
      title: '',
    })
  }, [clearTomTomHoverRequest])

  // Set up map layer hover events
  useEffect(() => {
    if (!mapRef.current?.getMap) return

    const map = mapRef.current.getMap()

    const layerConfigs = [
      {
        id: 'traffic-flow-layer',
        enabled: Boolean(segmentData && segmentStatusLayerEnabled),
        normalize: (
          properties: Record<string, unknown>
        ): HoveredTrafficFeature =>
          properties as unknown as HoveredTrafficFeature,
      },
    ]

    const waitForLayers = setInterval(() => {
      const missingEnabledLayer = layerConfigs.some(
        (layer) => layer.enabled && !map.getLayer(layer.id)
      )

      if (missingEnabledLayer) {
        return
      }

      clearInterval(waitForLayers)

      layerConfigs.forEach((layer) => {
        if (!layer.enabled) {
          return
        }

        const handleMouseEnter = () => {
          map.getCanvas().style.cursor = 'pointer'
        }

        const handleMouseLeave = () => {
          map.getCanvas().style.cursor = ''
          setHoveredFeature(null)
        }

        const handleMouseMove = (e: mapboxgl.MapLayerMouseEvent) => {
          if (!e.features || e.features.length === 0) {
            return
          }

          const feature = e.features[0] as GeoJSON.Feature
          const normalized = layer.normalize(
            (feature.properties ?? {}) as Record<string, unknown>
          )
          setHoveredFeature(normalized)

          const container = containerRef.current
          if (container) {
            const rect = container.getBoundingClientRect()
            setMousePosition({
              x: e.originalEvent.clientX - rect.left,
              y: e.originalEvent.clientY - rect.top,
            })
          }
        }

        map.on('mouseenter', layer.id, handleMouseEnter)
        map.on('mouseleave', layer.id, handleMouseLeave)
        map.on('mousemove', layer.id, handleMouseMove)

        // Cleanup listeners correctly when deps change.
        ;(layer as { cleanup?: () => void }).cleanup = () => {
          map.off('mouseenter', layer.id, handleMouseEnter)
          map.off('mouseleave', layer.id, handleMouseLeave)
          map.off('mousemove', layer.id, handleMouseMove)
        }
      })
    }, 100)

    return () => {
      clearInterval(waitForLayers)
      layerConfigs.forEach((layer) => {
        ;(layer as { cleanup?: () => void }).cleanup?.()
      })
    }
  }, [
    mapRef,
    segmentData,
    segmentStatusLayerEnabled,
    tomTomFlowTilesUrl,
    useTomTomFlowTiles,
  ])

  useEffect(() => {
    if (!useTomTomFlowTiles || !tomTomFlowTilesUrl || !mapRef.current?.getMap) {
      return
    }

    const map = mapRef.current.getMap()
    const layerId = 'tomtom-traffic-flow-layer'
    let cleanupLayerListeners: (() => void) | null = null

    const waitForLayer = setInterval(() => {
      if (!map.getLayer(layerId)) {
        return
      }

      clearInterval(waitForLayer)

      const handleMouseEnter = () => {
        map.getCanvas().style.cursor = 'pointer'
      }

      const handleMouseLeave = () => {
        map.getCanvas().style.cursor = ''
        resetTomTomHoverPopup()
      }

      const handleMouseMove = (e: mapboxgl.MapLayerMouseEvent) => {
        if (!e.features || e.features.length === 0) {
          return
        }

        const feature = e.features[0] as GeoJSON.Feature
        const properties = (feature.properties ?? {}) as Record<string, unknown>
        const title =
          String(
            properties.road_name ||
              properties.name ||
              properties.segment_name ||
              ''
          ).trim() || 'Đoạn đường TomTom'

        map.getCanvas().style.cursor = 'pointer'

        const container = containerRef.current
        if (container) {
          const rect = container.getBoundingClientRect()
          setMousePosition({
            x: e.originalEvent.clientX - rect.left,
            y: e.originalEvent.clientY - rect.top,
          })
        }

        // Debounce timer để tránh gọi API liên tục khi chuột vẫn còn di chuyển.
        // Nếu timer cũ không được clear ở đây, request chồng request sẽ dễ gây memory leak và dữ liệu popup bị race-condition.
        clearTomTomHoverRequest()

        const requestSequence = hoverSequenceRef.current + 1
        hoverSequenceRef.current = requestSequence

        setTomTomHoverPopup({
          visible: true,
          loading: true,
          error: null,
          detail: null,
          title,
        })

        hoverTimerRef.current = window.setTimeout(() => {
          const controller = new AbortController()
          hoverAbortRef.current = controller
          const lat = e.lngLat.lat
          const lng = e.lngLat.lng

          fetch(
            `${apiOrigin}/api/traffic/segment-detail?lat=${lat}&lng=${lng}`,
            {
              signal: controller.signal,
            }
          )
            .then(async (response) => {
              const payload = await response.json().catch(() => ({}))

              if (hoverSequenceRef.current !== requestSequence) {
                return
              }

              if (!response.ok || payload?.error) {
                setTomTomHoverPopup({
                  visible: true,
                  loading: false,
                  error:
                    payload?.error || 'Không có dữ liệu cho đoạn đường này',
                  detail: null,
                  title,
                })
                return
              }

              setTomTomHoverPopup({
                visible: true,
                loading: false,
                error: null,
                detail: {
                  currentSpeed: Number(payload.currentSpeed),
                  freeFlowSpeed: Number(payload.freeFlowSpeed),
                  trafficIndex: String(payload.trafficIndex),
                },
                title,
              })
            })
            .catch((error: unknown) => {
              if (
                controller.signal.aborted ||
                hoverSequenceRef.current !== requestSequence
              ) {
                return
              }

              console.error('TomTom segment detail error', error)
              setTomTomHoverPopup({
                visible: true,
                loading: false,
                error: 'Không thể lấy dữ liệu thực tế cho đoạn đường này',
                detail: null,
                title,
              })
            })
            .finally(() => {
              if (hoverAbortRef.current === controller) {
                hoverAbortRef.current = null
              }
            })
        }, 300)
      }

      map.on('mouseenter', layerId, handleMouseEnter)
      map.on('mouseleave', layerId, handleMouseLeave)
      map.on('mousemove', layerId, handleMouseMove)

      cleanupLayerListeners = () => {
        map.off('mouseenter', layerId, handleMouseEnter)
        map.off('mouseleave', layerId, handleMouseLeave)
        map.off('mousemove', layerId, handleMouseMove)
      }
    }, 100)

    return () => {
      clearInterval(waitForLayer)
      clearTomTomHoverRequest()
      cleanupLayerListeners?.()
    }
  }, [
    apiOrigin,
    clearTomTomHoverRequest,
    mapRef,
    resetTomTomHoverPopup,
    tomTomFlowTilesUrl,
    useTomTomFlowTiles,
  ])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    >
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: DEFAULT_MAP_CENTER[0],
          latitude: DEFAULT_MAP_CENTER[1],
          zoom: DEFAULT_MAP_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapboxStyle}
        mapboxAccessToken={mapboxToken}
        onClick={onMapClick}
        onLoad={updateViewportBounds}
        onMoveEnd={updateViewportBounds}
      >
        {renderedSegmentData &&
          renderedSegmentData.features.length > 0 &&
          segmentStatusLayerEnabled && (
            <Source
              id="traffic-source"
              type="geojson"
              data={renderedSegmentData}
            >
              <Layer {...trafficOutlineLayerStyle} />
              <Layer {...trafficLayerStyle} />
            </Source>
          )}

        {useTomTomFlowTiles &&
          tomTomFlowTilesUrl &&
          segmentStatusLayerEnabled && (
            <Source
              id="tomtom-flow-source"
              type="vector"
              tiles={[tomTomFlowTilesUrl]}
              minzoom={0}
              // Keep maxzoom at provider-supported level so map can overzoom instead of requesting empty high-z tiles.
              maxzoom={TOMTOM_FLOW_TILE_MAX_ZOOM}
            >
              <Layer {...tomTomFlowLayerStyle} />
            </Source>
          )}

        {/* Render children components (e.g., IncidentLayer) */}
        {children}
      </Map>

      {tomTomHoverPopup.visible && (
        <div
          style={{
            position: 'absolute',
            left: `${mousePosition.x + 15}px`,
            top: `${mousePosition.y - 10}px`,
            zIndex: 25,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.65)',
              borderRadius: '12px',
              padding: '16px',
              minWidth: '240px',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
              fontFamily: 'sans-serif',
            }}
          >
            <div style={{ marginBottom: '10px' }}>
              <div
                style={{
                  color: '#1F2937',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {tomTomHoverPopup.title || 'Đoạn đường TomTom'}
              </div>
              <div
                style={{
                  color: '#9CA3AF',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Dữ liệu tốc độ thực tế
              </div>
            </div>

            {tomTomHoverPopup.loading ? (
              <div>
                <div
                  style={{
                    height: '18px',
                    borderRadius: '999px',
                    background:
                      'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 37%, #e5e7eb 63%)',
                    backgroundSize: '400% 100%',
                    animation: 'pulse 1.2s ease-in-out infinite',
                    marginBottom: '10px',
                  }}
                />
                <div
                  style={{
                    height: '14px',
                    borderRadius: '999px',
                    background: '#f3f4f6',
                    marginBottom: '8px',
                    width: '85%',
                  }}
                />
                <div
                  style={{
                    height: '14px',
                    borderRadius: '999px',
                    background: '#f3f4f6',
                    width: '65%',
                  }}
                />
              </div>
            ) : tomTomHoverPopup.error ? (
              <div
                style={{
                  color: '#b91c1c',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              >
                {tomTomHoverPopup.error}
              </div>
            ) : tomTomHoverPopup.detail ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span
                      style={{
                        fontSize: '30px',
                        fontWeight: 'bold',
                        color: '#111827',
                        lineHeight: '1',
                      }}
                    >
                      {Math.round(tomTomHoverPopup.detail.currentSpeed)}
                    </span>
                    <span
                      style={{
                        color: '#6B7280',
                        fontSize: '12px',
                        marginLeft: '4px',
                      }}
                    >
                      km/h
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(255, 255, 255, 0.5)',
                      border: '1px solid #FFFFFF',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#2563eb',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        letterSpacing: '-0.025em',
                        color: '#2563eb',
                      }}
                    >
                      {getLosFromTrafficIndex(
                        Number(tomTomHoverPopup.detail.trafficIndex)
                      )}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(243, 244, 246, 0.7)',
                  }}
                >
                  <div style={{ color: '#374151', fontSize: '12px' }}>
                    Tốc độ tự do:{' '}
                    <span style={{ fontWeight: 'bold' }}>
                      {Math.round(tomTomHoverPopup.detail.freeFlowSpeed)} km/h
                    </span>
                  </div>
                  <div style={{ color: '#374151', fontSize: '12px' }}>
                    Traffic Index:{' '}
                    <span style={{ fontWeight: 'bold' }}>
                      {Number(tomTomHoverPopup.detail.trafficIndex).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Hover Popup */}
      {hoveredFeature &&
        (() => {
          const getPopUpData = (feature: GeoJSONFeature['properties']) => {
            const los = (feature.losIndex || 'N/A').toUpperCase()

            switch (los) {
              case 'A':
                return {
                  los,
                  status: 'Thông thoáng',
                  statusColor: TRAFFIC_COLORS.MINIMAL,
                  dotColor: TRAFFIC_COLORS.MINIMAL,
                }
              case 'B':
                return {
                  los,
                  status: 'Khá thông thoáng',
                  statusColor: TRAFFIC_COLORS.VERY_LOW,
                  dotColor: TRAFFIC_COLORS.VERY_LOW,
                }
              case 'C':
                return {
                  los,
                  status: 'Trung bình',
                  statusColor: TRAFFIC_COLORS.MODERATE,
                  dotColor: TRAFFIC_COLORS.MODERATE,
                }
              case 'D':
                return {
                  los,
                  status: 'Mật độ cao',
                  statusColor: TRAFFIC_COLORS.HIGH,
                  dotColor: TRAFFIC_COLORS.HIGH,
                }
              case 'E':
                return {
                  los,
                  status: 'Đông xe',
                  statusColor: TRAFFIC_COLORS.VERY_HIGH,
                  dotColor: TRAFFIC_COLORS.VERY_HIGH,
                }
              case 'F':
                return {
                  los,
                  status: 'Ùn tắc nghiêm trọng',
                  statusColor: TRAFFIC_COLORS.EXTREME,
                  dotColor: TRAFFIC_COLORS.EXTREME,
                }
              default:
                return {
                  los: 'N/A',
                  status: 'Không có dữ liệu',
                  statusColor: TRAFFIC_COLORS.NO_DATA,
                  dotColor: TRAFFIC_COLORS.NO_DATA,
                }
            }
          }

          const popUpData = getPopUpData(hoveredFeature)

          return (
            <div
              style={{
                position: 'absolute',
                left: `${mousePosition.x + 15}px`,
                top: `${mousePosition.y - 10}px`,
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  borderRadius: '12px',
                  padding: '16px',
                  minWidth: '220px',
                  boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
                  fontFamily: 'sans-serif',
                }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <div
                    style={{
                      color: '#1F2937',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {hoveredFeature.segmentName || 'Đoạn đường'}
                  </div>
                  <div
                    style={{
                      color: '#9CA3AF',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    ID: {hoveredFeature.segmentId}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span
                      style={{
                        fontSize: '30px',
                        fontWeight: 'bold',
                        color: '#111827',
                        lineHeight: '1',
                      }}
                    >
                      {Math.round(hoveredFeature.avgSpeed || 0)}
                    </span>
                    <span
                      style={{
                        color: '#6B7280',
                        fontSize: '12px',
                        marginLeft: '4px',
                      }}
                    >
                      km/h
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(255, 255, 255, 0.5)',
                      border: '1px solid #FFFFFF',
                    }}
                  >
                    <span
                      className="animate-pulse"
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: popUpData.dotColor,
                      }}
                    ></span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        letterSpacing: '-0.025em',
                        color: popUpData.statusColor,
                      }}
                    >
                      {popUpData.status}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(243, 244, 246, 0.5)',
                  }}
                >
                  <div style={{ color: '#6B7280', fontSize: '11px' }}>
                    Mức LOS:{' '}
                    <span style={{ fontWeight: 'bold', color: '#374151' }}>
                      {popUpData.los}
                    </span>
                  </div>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>
                    Cập nhật:{' '}
                    {hoveredFeature.lastUpdated
                      ? new Date(hoveredFeature.lastUpdated).toLocaleString(
                          'vi-VN',
                          {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          }
                        )
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
