// Traffic Layer Page

import { useQuery } from '@tanstack/react-query'
import { Spin } from 'antd'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, LayerProps, Source } from 'react-map-gl'

import { AlertFeed } from '@/components/widgets/AlertFeed'
import { CCTVModal } from '@/components/widgets/CCTVModal'
import { KPIBar } from '@/components/widgets/KPIBar'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MOCK_ALERTS,
} from '@/config/constants'
import apiService from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'

interface GeoJSONFeature {
  type: 'Feature'
  geometry: {
    type: 'LineString'
    coordinates: number[][]
  }
  properties: {
    segmentId: number
    segmentName: string
    avgSpeed: number
    losIndex: string
    color: string
    lastUpdated: string
  }
}

interface TrafficMapResponse {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
const mapboxStyle = import.meta.env.VITE_MAPBOX_STYLE

export const TrafficLayerPage: React.FC = () => {
  const { isLoading, error: globalError } = useAppStore()
  const [cctvModalVisible, setCCTVModalVisible] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)

  const [hoveredFeature, setHoveredFeature] = useState<
    GeoJSONFeature['properties'] | null
  >(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })

  const FALLBACK_DATA: TrafficMapResponse = {
    type: 'FeatureCollection',
    features: [],
  }

  const fetchTrafficMapData = async (): Promise<TrafficMapResponse> => {
    try {
      const response = await apiService.get('/map/segments')
      if (response?.data?.features) {
        console.log('Traffic Data:', response.data)
        return response.data
      }
      return FALLBACK_DATA
    } catch (err) {
      console.error('Error fetching traffic map:', err)
      return FALLBACK_DATA
    }
  }

  const {
    data: trafficData = FALLBACK_DATA,
    isLoading: mapLoading,
    error: apiError,
  } = useQuery({
    queryKey: ['trafficLayerData'],
    queryFn: fetchTrafficMapData,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  })

  const error = apiError
    ? apiError instanceof Error
      ? apiError.message
      : 'Failed to fetch'
    : globalError

  // Zoom and bounds
  useEffect(() => {
    if (trafficData && trafficData.features.length > 0 && mapRef.current) {
      const map = mapRef.current
      const bounds = trafficData.features.reduce(
        (acc, feature) => {
          feature.geometry.coordinates.forEach(([lon, lat]) => {
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
  }, [trafficData])

  const trafficLayerStyle = useMemo(
    () =>
      ({
        id: 'traffic-flow-layer',
        type: 'line',
        paint: {
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 14, 3.8],
          'line-color': [
            'case',
            ['==', ['upcase', ['coalesce', ['get', 'color'], '']], '#D9D9D9'],
            '#4B5563',
            ['coalesce', ['get', 'color'], '#4B5563'],
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

  useEffect(() => {
    if (!mapRef.current || !trafficData) return
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.on('mousemove', layerId, (e: any) => {
          if (e.features && e.features.length > 0) {
            setHoveredFeature(e.features[0].properties)
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect()
              setMousePosition({
                x: e.originalEvent.clientX - rect.left,
                y: e.originalEvent.clientY - rect.top,
              })
            }
          }
        })
        map.on('mouseleave', layerId, () => setHoveredFeature(null))
      }
    }, 100)
    return () => clearInterval(waitForLayer)
  }, [trafficData])

  const getLOSStatus = (losIndex: string) => {
    const losMap: Record<string, { label: string; color: string }> = {
      A: { label: 'Tốt', color: '#52C41A' },
      B: { label: 'Khá', color: '#95DE64' },
      C: { label: 'Bình thường', color: '#FAAD14' },
      D: { label: 'Yếu', color: '#FA8C16' },
      E: { label: 'Rất yếu', color: '#FF7A45' },
      F: { label: 'Kẹt xe', color: '#FF4D4F' },
    }
    return losMap[losIndex] || { label: 'N/A', color: '#999999' }
  }

  const handleZoomIn = () =>
    mapRef.current?.zoomTo(mapRef.current.getZoom() + 1, { duration: 300 })
  const handleZoomOut = () =>
    mapRef.current?.zoomTo(mapRef.current.getZoom() - 1, { duration: 300 })
  const handleCompassReset = () =>
    mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 500 })

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        borderRadius: 8,
        boxShadow:
          '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
      }}
    >
      {(isLoading || mapLoading) && trafficData.features.length === 0 && (
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
      )}

      {error && trafficData.features.length === 0 && (
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
          Error: {error as string}
        </div>
      )}

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
      >
        {trafficData && trafficData.features.length > 0 && (
          <Source id="traffic-source" type="geojson" data={trafficData}>
            {heatmapEnabled && <Layer {...heatmapLayerStyle} />}
            <Layer {...trafficLayerStyle} />
          </Source>
        )}
      </Map>

      {/* Hover Popup */}
      {hoveredFeature &&
        (() => {
          const getPopUpData = (feature: any) => {
            let los = feature.losIndex
            let status = 'Thông thoáng'
            let statusColor = '#22C55E'
            let dotColor = '#22C55E'

            if (los === 'N/A' || !los) {
              const color = feature.color?.toUpperCase()
              if (color === '#FF4D4F' || color === 'RED') {
                los = 'F'
                status = 'Ùn tắc'
                statusColor = '#EF4444'
                dotColor = '#EF4444'
              } else if (
                color === '#FAAD14' ||
                color === 'ORANGE' ||
                color === 'YELLOW'
              ) {
                los = 'D'
                status = 'Đông xe'
                statusColor = '#F97316'
                dotColor = '#F97316'
              } else {
                los = 'A'
              }
            } else {
              const losMap: Record<
                string,
                { label: string; statusColor: string; dotColor: string }
              > = {
                A: {
                  label: 'Thông thoáng',
                  statusColor: '#22C55E',
                  dotColor: '#22C55E',
                },
                B: {
                  label: 'Thông thoáng',
                  statusColor: '#22C55E',
                  dotColor: '#22C55E',
                },
                C: {
                  label: 'Bình thường',
                  statusColor: '#EAB308',
                  dotColor: '#EAB308',
                },
                D: {
                  label: 'Đông xe',
                  statusColor: '#F97316',
                  dotColor: '#F97316',
                },
                E: {
                  label: 'Rất đông',
                  statusColor: '#EA580C',
                  dotColor: '#EA580C',
                },
                F: {
                  label: 'Ùn tắc',
                  statusColor: '#EF4444',
                  dotColor: '#EF4444',
                },
              }
              const data = losMap[los] || {
                label: 'Thông thoáng',
                statusColor: '#22C55E',
                dotColor: '#22C55E',
              }
              status = data.label
              statusColor = data.statusColor
              dotColor = data.dotColor
            }
            return { los, status, statusColor, dotColor }
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
                      color: popUpData.statusColor,
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

      {/* Widgets Layering */}
      <KPIBar />
      <AlertFeed alerts={MOCK_ALERTS} />
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onCompass={handleCompassReset}
        onCamera={() => setCCTVModalVisible(true)}
        onHeatmapToggle={setHeatmapEnabled}
      />
      <MapLegend />
      <CCTVModal
        visible={cctvModalVisible}
        onClose={() => setCCTVModalVisible(false)}
      />
    </div>
  )
}
