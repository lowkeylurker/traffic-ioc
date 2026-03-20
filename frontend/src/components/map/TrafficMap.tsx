// Traffic Map Component

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  TRAFFIC_COLORS,
} from '@/config/constants'
import { GeoJSONFeature, SegmentResponse } from '@/types'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, LayerProps, Source } from 'react-map-gl'

const MAX_RENDER_SEGMENTS = 12000
const MAX_FEATURES_FOR_AUTO_FIT = 50000
const MIN_RENDER_SEGMENTS = 2500

type MapBounds = {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

interface TrafficMapProps {
  segmentData: SegmentResponse | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trafficStatus?: any[] // Optional traffic status data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMapClick?: (event: any) => void
  style?: React.CSSProperties
  autoRefreshInterval?: number
  mapRef?: React.RefObject<any>
  heatmapEnabled?: boolean
  children?: React.ReactNode
}

export const TrafficMap: React.FC<TrafficMapProps> = ({
  segmentData,
  onMapClick,
  style,
  mapRef: externalMapRef,
  heatmapEnabled = false,
  children,
}) => {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapboxStyle = import.meta.env.VITE_MAPBOX_STYLE
  const internalMapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = externalMapRef || internalMapRef
  const [hoveredFeature, setHoveredFeature] = useState<
    GeoJSONFeature['properties'] | null
  >(null)
  const [viewportBounds, setViewportBounds] = useState<MapBounds | null>(null)
  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_MAP_ZOOM)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })

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
      return {
        ...segmentData,
        features: segmentData.features.slice(0, renderCap),
      }
    }

    const visibleFeatures: GeoJSONFeature[] = []

    for (let i = 0; i < segmentData.features.length; i += 1) {
      const bounds = featureBounds[i]
      if (!bounds) continue

      const intersectsViewport =
        bounds.maxLon >= viewportBounds.minLon &&
        bounds.minLon <= viewportBounds.maxLon &&
        bounds.maxLat >= viewportBounds.minLat &&
        bounds.minLat <= viewportBounds.maxLat

      if (intersectsViewport) {
        visibleFeatures.push(segmentData.features[i])
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 14, 3.8],
          'line-color': [
            'match',
            ['upcase', ['to-string', ['coalesce', ['get', 'losIndex'], 'N/A']]],
            'A',
            TRAFFIC_COLORS.FAST,
            'B',
            TRAFFIC_COLORS.FAST,
            'C',
            TRAFFIC_COLORS.FAST,
            'D',
            TRAFFIC_COLORS.MODERATE,
            'E',
            TRAFFIC_COLORS.MODERATE,
            'F',
            TRAFFIC_COLORS.SLOW,
            TRAFFIC_COLORS.NO_DATA,
          ],
          'line-opacity': 0.92,
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      }) as LayerProps,
    []
  )

  // Create heatmap layer style
  const heatmapLayerStyle = useMemo(
    () =>
      ({
        id: 'traffic-heatmap-layer',
        type: 'heatmap',
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'avgSpeed'],
            0,
            0,
            70,
            1,
          ],
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0,
            1,
            18,
            3,
          ],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            '#008000',
            0.33,
            '#ffff00',
            0.66,
            '#ff7f00',
            1,
            '#ff0000',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 18, 20],
          'heatmap-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0,
            0.8,
            18,
            0.3,
          ],
        },
      }) as LayerProps,
    []
  )

  // Set up map layer hover events
  useEffect(() => {
    if (!mapRef.current || !segmentData) return

    const map = mapRef.current.getMap()
    const layerId = 'traffic-flow-layer'

    const waitForLayer = setInterval(() => {
      if (map.getLayer(layerId)) {
        clearInterval(waitForLayer)
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = ''
        })

        // Handle hover feature data
        map.on('mousemove', layerId, (e: mapboxgl.MapLayerMouseEvent) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0] as GeoJSON.Feature
            setHoveredFeature(
              feature.properties as GeoJSONFeature['properties']
            )

            // Calculate position relative to map container
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect()
              setMousePosition({
                x: e.originalEvent.clientX - rect.left,
                y: e.originalEvent.clientY - rect.top,
              })
            }
          }
        })

        map.on('mouseleave', layerId, () => {
          setHoveredFeature(null)
        })
      }
    }, 100)

    return () => clearInterval(waitForLayer)
  }, [segmentData, mapRef])

  // Determine LOS status display
  // const getLOSStatus = (losIndex: string) => {
  //   const losMap: Record<string, { label: string; color: string }> = {
  //     A: { label: 'Tốt', color: '#52C41A' },
  //     B: { label: 'Khá', color: '#95DE64' },
  //     C: { label: 'Bình thường', color: '#FAAD14' },
  //     D: { label: 'Yếu', color: '#FA8C16' },
  //     E: { label: 'Rất yếu', color: '#FF7A45' },
  //     F: { label: 'Kẹt xe', color: '#FF4D4F' },
  //   }
  //   return losMap[losIndex] || { label: 'N/A', color: '#999999' }
  // }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    >
      {/* {loading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <Spin tip="Loading traffic map..." />
        </div>
      )} */}

      {/* {error && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 10,
            backgroundColor: '#ff4d4f',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          Error: {error}
        </div>
      )} */}

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
        {renderedSegmentData && renderedSegmentData.features.length > 0 && (
          <Source id="traffic-source" type="geojson" data={renderedSegmentData}>
            {heatmapEnabled && <Layer {...heatmapLayerStyle} />}
            <Layer {...trafficLayerStyle} />
          </Source>
        )}
        {children}
      </Map>

      {/* Hover Popup */}
      {hoveredFeature &&
        (() => {
          const getPopUpData = (feature: GeoJSONFeature['properties']) => {
            const los = (feature.losIndex || 'N/A').toUpperCase()

            if (los === 'A' || los === 'B' || los === 'C') {
              return {
                los,
                status: 'Thông thoáng',
                statusColor: TRAFFIC_COLORS.FAST,
                dotColor: TRAFFIC_COLORS.FAST,
              }
            }

            if (los === 'D' || los === 'E') {
              return {
                los,
                status: 'Đông xe',
                statusColor: TRAFFIC_COLORS.MODERATE,
                dotColor: TRAFFIC_COLORS.MODERATE,
              }
            }

            if (los === 'F') {
              return {
                los,
                status: 'Ùn tắc',
                statusColor: TRAFFIC_COLORS.SLOW,
                dotColor: TRAFFIC_COLORS.SLOW,
              }
            }

            return {
              los: 'N/A',
              status: 'Không có dữ liệu',
              statusColor: TRAFFIC_COLORS.NO_DATA,
              dotColor: TRAFFIC_COLORS.NO_DATA,
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
                    {hoveredFeature.segmentName}
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
                      {Math.round(hoveredFeature.avgSpeed)}
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
                    {new Date(hoveredFeature.lastUpdated).toLocaleTimeString(
                      'vi-VN'
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
