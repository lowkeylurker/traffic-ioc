import { DEFAULT_MAP_CENTER, TRAFFIC_COLORS } from '@/config/constants'
import { SegmentResponse, TrafficStatus } from '@/types'
import { Card, Typography } from 'antd'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useMemo, useState } from 'react'
import MapGL, { Layer, LayerProps, Source } from 'react-map-gl'
import * as turf from '@turf/turf'

const { Text } = Typography

interface SelectionMapProps {
  segmentData: SegmentResponse | null
  trafficStatus: TrafficStatus[] | null
  onSelect: (roadInfo: {
    roadName: string
    roadKey?: string
    segmentCount: number
    segmentIds: number[]
  }) => void
  onHover?: (
    roadInfo: {
      roadName: string
      roadKey?: string
      segmentCount: number
      segmentIds: number[]
    } | null
  ) => void
  disabled?: boolean
  style?: React.CSSProperties
}

export const SelectionMap: React.FC<SelectionMapProps> = ({
  segmentData,
  trafficStatus,
  onSelect,
  onHover,
  disabled = false,
  style,
}) => {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapboxStyle = import.meta.env.VITE_MAPBOX_STYLE

  const [hoveredRoadKey, setHoveredRoadKey] = useState<string | null>(null)
  const [hoveredRoadName, setHoveredRoadName] = useState<string | null>(null)
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null)
  const [hoveredSegmentIds, setHoveredSegmentIds] = useState<number[]>([])

  // Merge status into GeoJSON for coloring
  const processedGeoJson = useMemo(() => {
    if (!segmentData) return null

    const statusMap = new Map<number, TrafficStatus>()
    trafficStatus?.forEach((s) => statusMap.set(Number(s.segmentId), s))

    return {
      ...segmentData,
      features: segmentData.features
        .filter((f) => statusMap.has(Number(f.properties.segmentId)))
        .map((f) => {
          const status = statusMap.get(Number(f.properties.segmentId))
          let color = '#9CA3AF'

          if (status) {
            const speed = status.currentSpeed
            if (speed > 50) color = TRAFFIC_COLORS.MINIMAL
            else if (speed > 35) color = TRAFFIC_COLORS.VERY_LOW
            else if (speed > 25) color = TRAFFIC_COLORS.MODERATE
            else if (speed > 15) color = TRAFFIC_COLORS.HIGH
            else if (speed > 5) color = TRAFFIC_COLORS.VERY_HIGH
            else color = TRAFFIC_COLORS.EXTREME
          }

          return {
            ...f,
            properties: {
              ...f.properties,
              speedColor: color,
              currentSpeed: status?.currentSpeed || 0,
            },
          }
        }),
    }
  }, [segmentData, trafficStatus])

  React.useEffect(() => {
    if (!disabled) return
    setHoveredRoadKey(null)
    setHoveredRoadName(null)
    setHoveredDistrict(null)
    setHoveredSegmentIds([])
    if (onHover) onHover(null)
  }, [disabled, onHover])

  const layers = useMemo(() => {
    const baseLayer: LayerProps = {
      id: 'segments-base',
      type: 'line',
      paint: {
        'line-width': 4,
        'line-color': ['get', 'speedColor'],
        'line-opacity': 1.0,
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
    }

    const outlineLayer: LayerProps = {
      id: 'segments-outline',
      type: 'line',
      paint: {
        'line-width': 6,
        'line-color': '#000000',
        'line-opacity': 0.2,
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
    }

    const highlightLayer: LayerProps = {
      id: 'segments-highlight',
      type: 'line',
      paint: {
        'line-width': 6,
        'line-color': '#1890ff',
        'line-opacity': [
          'case',
          ['in', ['get', 'segmentId'], ['literal', hoveredSegmentIds]],
          0.8,
          0,
        ],
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
    }

    return { baseLayer, outlineLayer, highlightLayer }
  }, [hoveredSegmentIds])

  const handleMouseMove = (e: any) => {
    if (disabled) return
    const feature = e.features?.[0]
    if (feature && segmentData) {
      const roadKey = (feature.properties?.roadKey as string) || null
      const roadName = (feature.properties?.roadName as string) || null
      const district = (feature.properties?.district as string) || null

      setHoveredRoadKey(roadKey)
      setHoveredRoadName(roadName)
      setHoveredDistrict(district)

      if (roadName && onHover) {
        const point = [e.lngLat.lng, e.lngLat.lat]
        const relatedSegments = segmentData.features.filter((f) => {
          const isSameRoad = roadKey
            ? f.properties.roadKey === roadKey
            : f.properties.roadName === roadName

          if (!isSameRoad) return false

          try {
            const featCoords = f.geometry.coordinates[0]
            const distance = turf.distance(point, featCoords)
            return distance < 3.0
          } catch {
            return false
          }
        })

        const ids = relatedSegments.map((f) => f.properties.segmentId)
        setHoveredSegmentIds(ids)

        onHover({
          roadName: district ? `${roadName} (${district})` : roadName,
          roadKey: roadKey || undefined,
          segmentCount: relatedSegments.length,
          segmentIds: ids,
        })
      }
    } else {
      setHoveredRoadKey(null)
      setHoveredRoadName(null)
      setHoveredDistrict(null)
      if (onHover) onHover(null)
    }
  }

  const handleClick = (e: any) => {
    if (disabled) return
    const feature = e.features?.[0]
    if (feature && segmentData) {
      const roadName =
        (feature.properties?.roadName as string) || 'Đường không tên'
      const roadKey = feature.properties?.roadKey as string | undefined
      const district = feature.properties?.district as string | null

      const point = [e.lngLat.lng, e.lngLat.lat]
      const relatedSegments = segmentData.features.filter((f) => {
        const isSameRoad = roadKey
          ? f.properties.roadKey === roadKey
          : f.properties.roadName === roadName

        if (!isSameRoad) return false

        try {
          const featCoords = f.geometry.coordinates[0]
          const distance = turf.distance(point, featCoords)
          return distance < 3.0
        } catch {
          return false
        }
      })

      onSelect({
        roadName: district ? `${roadName} (${district})` : roadName,
        roadKey,
        segmentCount: relatedSegments.length,
        segmentIds: relatedSegments.map((f: any) => f.properties.segmentId),
      })
    }
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <MapGL
        initialViewState={{
          longitude: DEFAULT_MAP_CENTER[0],
          latitude: DEFAULT_MAP_CENTER[1],
          zoom: 12,
        }}
        style={{ width: '100%', height: '100%', borderRadius: 8 }}
        mapStyle={mapboxStyle}
        mapboxAccessToken={mapboxToken}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        interactiveLayerIds={disabled ? [] : ['segments-base']}
        cursor={disabled ? 'not-allowed' : 'pointer'}
      >
        {processedGeoJson && (
          <Source
            id="selection-source"
            type="geojson"
            data={processedGeoJson as any}
          >
            <Layer {...layers.outlineLayer} />
            <Layer {...layers.baseLayer} />
            <Layer {...layers.highlightLayer} />
          </Source>
        )}
      </MapGL>

      {disabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255, 255, 255, 0.45)',
            borderRadius: 8,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        />
      )}

      <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }}>
        <Card
          size="small"
          style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {disabled
              ? 'Đang khóa chọn đường. Vui lòng bấm Quay lại Hiện tại để chọn lại.'
              : hoveredRoadName
                ? `Đang chọn: ${hoveredRoadName}${hoveredDistrict ? ` (${hoveredDistrict})` : ''}`
                : 'Click để chọn đoạn đường/trục đường'}
          </Text>
        </Card>
      </div>
    </div>
  )
}
