// Traffic Map Component

import React, { useMemo, useEffect, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Map, { Source, Layer, LayerProps } from 'react-map-gl'
import apiService from '@/services/api'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/config/constants'
import { Card, Spin } from 'antd'
import 'mapbox-gl/dist/mapbox-gl.css'

interface TrafficMapProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  segments?: any[] // Optional segments data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trafficStatus?: any[] // Optional traffic status data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMapClick?: (event: any) => void
  style?: React.CSSProperties
  autoRefreshInterval?: number // in milliseconds, default 30s
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapRef?: React.RefObject<any> // Allow parent to control map
  heatmapEnabled?: boolean // Toggle heatmap layer
}

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

export const TrafficMap: React.FC<TrafficMapProps> = ({
  onMapClick,
  style,
  autoRefreshInterval = 10000, // 10 seconds default
  mapRef: externalMapRef,
  heatmapEnabled = false,
}) => {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapboxStyle = import.meta.env.VITE_MAPBOX_STYLE
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internalMapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = externalMapRef || internalMapRef
  const [hoveredFeature, setHoveredFeature] = useState<
    GeoJSONFeature['properties'] | null
  >(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })
  // Fallback mock data if API fails
  const FALLBACK_DATA: TrafficMapResponse = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [106.699, 10.78],
            [106.7, 10.785],
          ],
        },
        properties: {
          segmentId: 1,
          segmentName: 'Đường Lê Duẩn',
          avgSpeed: 45,
          losIndex: 'A',
          color: '#52C41A',
          lastUpdated: new Date().toISOString(),
        },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [106.695, 10.782],
            [106.702, 10.778],
          ],
        },
        properties: {
          segmentId: 2,
          segmentName: 'Đường Pasteur',
          avgSpeed: 10,
          losIndex: 'F',
          color: '#FF4D4F',
          lastUpdated: new Date().toISOString(),
        },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [106.697, 10.788],
            [106.705, 10.785],
          ],
        },
        properties: {
          segmentId: 3,
          segmentName: 'Đường Hai Bà Trưng',
          avgSpeed: 25,
          losIndex: 'D',
          color: '#FAAD14',
          lastUpdated: new Date().toISOString(),
        },
      },
    ],
  }

  // Helper function to fetch traffic map data
  const fetchTrafficMapData = async (): Promise<TrafficMapResponse> => {
    try {
      const response = await apiService.get('/map/segments')
      const geoJsonData = response?.data

      if (geoJsonData?.features?.length > 0) {
        return geoJsonData
      }

      console.warn('Invalid or empty traffic data response, using fallback')
      return FALLBACK_DATA
    } catch (err) {
      console.error('Error fetching traffic map:', err)
      return FALLBACK_DATA
    }
  }

  // Fetch traffic map data using React Query
  const {
    data: trafficData = FALLBACK_DATA,
    isLoading: loading,
    error: apiError,
  } = useQuery({
    queryKey: ['trafficMap'],
    queryFn: fetchTrafficMapData,
    refetchInterval: autoRefreshInterval, // Enable polling
    refetchIntervalInBackground: true, // Continue polling in background
    staleTime: 0, // Always refetch when component mounts
  })

  const error = apiError
    ? apiError instanceof Error
      ? apiError.message
      : 'Failed to fetch traffic map'
    : null

  // Auto-fit map bounds when traffic data loads
  useEffect(() => {
    if (trafficData && trafficData.features.length > 0 && mapRef.current) {
      const map = mapRef.current
      const bounds = trafficData.features.reduce(
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
  }, [trafficData])

  // Create traffic layer style
  const trafficLayerStyle = useMemo(
    () =>
      ({
        id: 'traffic-flow-layer',
        type: 'line',
        paint: {
          'line-width': 4,
          'line-color': ['get', 'color'],
          'line-opacity': 0.75,
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
    if (!mapRef.current || !trafficData) return

    const map = mapRef.current.getMap()
    const layerId = 'traffic-flow-layer'

    // Wait for layer to be loaded
    const waitForLayer = setInterval(() => {
      if (map.getLayer(layerId)) {
        clearInterval(waitForLayer)

        // Change cursor on hover
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
  }, [trafficData, mapRef])

  // Determine LOS status display
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

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    >
      {loading && (
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

      {error && (
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
        onClick={onMapClick}
      >
        {trafficData && trafficData.features.length > 0 && (
          <Source id="traffic-source" type="geojson" data={trafficData}>
            {heatmapEnabled && <Layer {...heatmapLayerStyle} />}
            <Layer {...trafficLayerStyle} />
          </Source>
        )}
      </Map>

      {/* Hover Popup */}
      {hoveredFeature && (() => {
        const getPopUpData = (feature: GeoJSONFeature['properties']) => {
          let los = feature.losIndex;
          let status = 'Thông thoáng';
          let statusColor = '#22C55E'; // text-green-500
          let dotColor = '#22C55E'; // bg-green-500

          if (los === 'N/A' || !los) {
            const color = feature.color?.toUpperCase();
            if (color === '#FF4D4F' || color === 'RED') {
              los = 'F';
              status = 'Ùn tắc';
              statusColor = '#EF4444'; // text-red-500
              dotColor = '#EF4444';
            } else if (color === '#FAAD14' || color === 'ORANGE' || color === 'YELLOW') {
              los = 'D';
              status = 'Đông xe';
              statusColor = '#F97316'; // text-orange-500
              dotColor = '#F97316';
            } else {
              los = 'A';
            }
          } else {
            const losMap: Record<string, { label: string; statusColor: string; dotColor: string }> = {
              A: { label: 'Thông thoáng', statusColor: '#22C55E', dotColor: '#22C55E' },
              B: { label: 'Thông thoáng', statusColor: '#22C55E', dotColor: '#22C55E' },
              C: { label: 'Bình thường', statusColor: '#EAB308', dotColor: '#EAB308' },
              D: { label: 'Đông xe', statusColor: '#F97316', dotColor: '#F97316' },
              E: { label: 'Rất đông', statusColor: '#EA580C', dotColor: '#EA580C' },
              F: { label: 'Ùn tắc', statusColor: '#EF4444', dotColor: '#EF4444' },
            };
            const data = losMap[los] || { label: 'Thông thoáng', statusColor: '#22C55E', dotColor: '#22C55E' };
            status = data.label;
            statusColor = data.statusColor;
            dotColor = data.dotColor;
          }
          return { los, status, statusColor, dotColor };
        };

        const popUpData = getPopUpData(hoveredFeature);

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
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '12px',
              padding: '16px',
              minWidth: '220px',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
              fontFamily: 'sans-serif'
            }}>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ color: '#1F2937', fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {hoveredFeature.segmentName}
                </div>
                <div style={{ color: '#9CA3AF', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ID: {hoveredFeature.segmentId}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '30px', fontWeight: 'bold', color: '#111827', lineHeight: '1' }}>
                    {Math.round(hoveredFeature.avgSpeed)}
                  </span>
                  <span style={{ color: '#6B7280', fontSize: '12px', marginLeft: '4px' }}>km/h</span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  border: '1px solid #FFFFFF'
                }}>
                  <span className="animate-pulse" style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: popUpData.dotColor
                  }}></span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '-0.025em',
                    color: popUpData.statusColor
                  }}>
                    {popUpData.status}
                  </span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid rgba(243, 244, 246, 0.5)'
              }}>
                <div style={{ color: '#6B7280', fontSize: '11px' }}>
                  Mức LOS: <span style={{ fontWeight: 'bold', color: '#374151' }}>{popUpData.los}</span>
                </div>
                <div style={{ color: '#9CA3AF', fontSize: '11px' }}>
                  Cập nhật: {new Date(hoveredFeature.lastUpdated).toLocaleTimeString('vi-VN')}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  )
}
