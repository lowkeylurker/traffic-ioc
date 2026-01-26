// Traffic Map Component

import React, { useMemo } from 'react'
import Map, { Source, Layer } from 'react-map-gl'
import { Segment, TrafficStatus } from '@/types'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, LOS_COLORS } from '@/config/constants'
import 'mapbox-gl/dist/mapbox-gl.css'

interface TrafficMapProps {
  segments?: Segment[]
  trafficStatus?: TrafficStatus[]
  onMapClick?: (event: any) => void
  style?: React.CSSProperties
}

export const TrafficMap: React.FC<TrafficMapProps> = ({
  segments = [],
  trafficStatus = [],
  onMapClick,
  style,
}) => {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN

  // Create GeoJSON from segments with traffic status
  const geojsonData = useMemo(() => {
    if (segments.length === 0) {
      return {
        type: 'FeatureCollection' as const,
        features: [],
      }
    }

    return {
      type: 'FeatureCollection' as const,
      features: segments.map((segment) => {
        const status = trafficStatus.find((s) => s.segmentId === segment.segmentId)
        return {
          type: 'Feature' as const,
          properties: {
            segmentId: segment.segmentId,
            segmentName: segment.segmentName,
            los: status?.losGrade || 'A',
            speed: status?.currentSpeed || 0,
          },
          geometry: segment.geometry,
        }
      }),
    }
  }, [segments, trafficStatus])

  return (
    <div style={{ width: '100%', height: '100%', ...style }}>
      <Map
        initialViewState={{
          longitude: DEFAULT_MAP_CENTER[0],
          latitude: DEFAULT_MAP_CENTER[1],
          zoom: DEFAULT_MAP_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={mapboxToken}
        onClick={onMapClick}
      >
        {geojsonData.features.length > 0 && (
          <Source id="traffic-data" type="geojson" data={geojsonData as any}>
            <Layer
              id="traffic-lines"
              type="line"
              paint={{
                'line-color': [
                  'case',
                  ['boolean', ['feature-state', 'hover'], false],
                  '#000000',
                  [
                    'match',
                    ['get', 'los'],
                    'A',
                    LOS_COLORS['A'],
                    'B',
                    LOS_COLORS['B'],
                    'C',
                    LOS_COLORS['C'],
                    'D',
                    LOS_COLORS['D'],
                    'E',
                    LOS_COLORS['E'],
                    'F',
                    LOS_COLORS['F'],
                    '#1890ff',
                  ],
                ],
                'line-width': 3,
                'line-opacity': 0.8,
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  )
}
