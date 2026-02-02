// Traffic Map Component

import React, { useMemo, useEffect, useState, useRef } from 'react'
import Map, { Source, Layer, LayerProps } from 'react-map-gl'
import apiService from '@/services/api'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/config/constants'
import { Card } from 'antd'
import 'mapbox-gl/dist/mapbox-gl.css'

interface TrafficMapProps {
  segments?: any[] // Optional segments data
  trafficStatus?: any[] // Optional traffic status data
  onMapClick?: (event: any) => void
  style?: React.CSSProperties
  autoRefreshInterval?: number // in milliseconds, default 30s
  mapRef?: React.RefObject<any> // Allow parent to control map
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
  autoRefreshInterval = 30000, // 30 seconds default
  mapRef: externalMapRef,
}) => {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapboxStyle = import.meta.env.VITE_MAPBOX_STYLE
  const internalMapRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = externalMapRef || internalMapRef
  const [trafficData, setTrafficData] = useState<TrafficMapResponse | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [hoveredFeature, setHoveredFeature] = useState<any>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

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

  // Fetch traffic map data
  const fetchTrafficMap = async () => {
    try {
      setError(null)
      const response = await apiService.get('/map/segments')

      // Check if response has data property with features
      if (response && response.data) {
        const geoJsonData = response.data

        if (geoJsonData.features && geoJsonData.features.length > 0) {
          console.log(
            `✓ Loaded ${geoJsonData.features.length} traffic segments`
          )
          setTrafficData(geoJsonData)
        } else {
          console.warn('No features found in response, using fallback')
          setTrafficData(FALLBACK_DATA)
        }
      } else {
        console.warn('No data property in response, using fallback')
        console.warn('Response structure:', response)
        setTrafficData(FALLBACK_DATA)
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch traffic map'
      console.error('Error fetching traffic map:', err)
      setTrafficData(FALLBACK_DATA)
      setError(`Using mock data - ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  // Fetch data on mount and set up auto-refresh
  useEffect(() => {
    fetchTrafficMap()

    const interval = setInterval(fetchTrafficMap, autoRefreshInterval)
    return () => clearInterval(interval)
  }, [autoRefreshInterval])

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
          Loading traffic map...
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
      {hoveredFeature && (
        <div
          style={{
            position: 'absolute',
            left: `${mousePosition.x + 15}px`,
            top: `${mousePosition.y - 10}px`,
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <Card
            size="small"
            style={{
              width: '280px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <div>
                <span
                  style={{
                    fontWeight: '600',
                    fontSize: '14px',
                    color: 'rgba(0,0,0,0.85)',
                  }}
                >
                  {hoveredFeature.segmentName}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: 'rgba(0,0,0,0.65)' }}>Vận tốc:</span>
                <span style={{ fontWeight: '500', color: 'rgba(0,0,0,0.85)' }}>
                  {hoveredFeature.avgSpeed} km/h
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: 'rgba(0,0,0,0.65)' }}>LOS:</span>
                <span
                  style={{
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: getLOSStatus(hoveredFeature.losIndex)
                      .color,
                    padding: '2px 8px',
                    borderRadius: '3px',
                    minWidth: '40px',
                    textAlign: 'center',
                  }}
                >
                  {hoveredFeature.losIndex}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: 'rgba(0,0,0,0.65)' }}>Trạng thái:</span>
                <span
                  style={{
                    fontWeight: '500',
                    color: getLOSStatus(hoveredFeature.losIndex).color,
                  }}
                >
                  {getLOSStatus(hoveredFeature.losIndex).label}
                </span>
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: 'rgba(0,0,0,0.45)',
                  marginTop: '4px',
                }}
              >
                Cập nhật:{' '}
                {new Date(hoveredFeature.lastUpdated).toLocaleTimeString(
                  'vi-VN'
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
