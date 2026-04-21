import { DEFAULT_MAP_CENTER, TRAFFIC_COLORS } from '@/config/constants'
import { SegmentResponse, TrafficStatus } from '@/types'
import { Card, Typography } from 'antd'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useMemo, useState } from 'react'
import MapGL, { Layer, LayerProps, Source } from 'react-map-gl'

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
          [
            'any',
            ['==', ['get', 'roadKey'], hoveredRoadKey || ''],
            ['==', ['get', 'roadName'], hoveredRoadName || ''],
          ],
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
  }, [hoveredRoadKey, hoveredRoadName])

  const handleMouseMove = (e: any) => {
    if (disabled) return
    const feature = e.features?.[0]
    if (feature && segmentData) {
      const roadKey = (feature.properties?.roadKey as string) || null
      const roadName = (feature.properties?.roadName as string) || null

      setHoveredRoadKey(roadKey)
      setHoveredRoadName(roadName)

      if (roadName && onHover) {
        const relatedSegments = segmentData.features.filter(
          (f) =>
            (roadKey && f.properties.roadKey === roadKey) ||
            (!roadKey && f.properties.roadName === roadName)
        )
        onHover({
          roadName,
          roadKey: roadKey || undefined,
          segmentCount: relatedSegments.length,
          segmentIds: relatedSegments.map((f) => f.properties.segmentId),
        })
      }
    } else {
      setHoveredRoadKey(null)
      setHoveredRoadName(null)
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

      const relatedSegments = segmentData.features.filter(
        (f) =>
          (roadKey && f.properties.roadKey === roadKey) ||
          (!roadKey && f.properties.roadName === roadName)
      )

      onSelect({
        roadName,
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
                ? `Đang chọn: ${hoveredRoadName}`
                : 'Click để chọn đoạn đường/trục đường'}
          </Text>
        </Card>
      </div>
    </div>
  )
}
