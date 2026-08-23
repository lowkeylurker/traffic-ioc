import { DEFAULT_MAP_CENTER } from '@/config/constants'
import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core'
import { Card, Typography, Menu } from 'antd'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { Layer, LayerProps, Source, Marker } from 'react-map-gl'
import { EnvironmentFilled } from '@ant-design/icons'

const { Text } = Typography

interface SelectionMapProps {
  segmentData?: any
  trafficStatus?: any[]
  onSelect: (roadInfo: {
    roadName: string
    roadKey?: string
    segmentCount: number
    segmentIds: string[]
    center?: [number, number]
  }) => void
  onSelectSegment?: (segmentIds: string[]) => void
  onSelectPoint?: (type: 'start' | 'end', point: [number, number]) => void
  simulationStart?: [number, number] | null
  simulationEnd?: [number, number] | null
  viewMode?: string
  onHover?: (
    roadInfo: {
      roadName: string
      roadKey?: string
      segmentCount: number
      segmentIds: string[]
    } | null
  ) => void
  disabled?: boolean
  style?: React.CSSProperties
  blockedSegmentIds?: string[]
  focusRoad?: {
    roadName: string
    roadKey?: string
    segmentCount: number
    segmentIds: string[]
    center?: [number, number]
    geojson?: any
  } | null
}

const collectCoordinates = (value: unknown): [number, number][] => {
  if (!Array.isArray(value)) return []
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [[value[0], value[1]]]
  }
  return value.flatMap((item) => collectCoordinates(item))
}

const collectGeoJsonCoordinates = (geojson: any): [number, number][] => {
  if (!geojson) return []
  if (geojson.type === 'FeatureCollection') {
    return (geojson.features || []).flatMap((feature: any) => collectGeoJsonCoordinates(feature))
  }
  if (geojson.type === 'Feature') {
    return collectGeoJsonCoordinates(geojson.geometry)
  }
  return collectCoordinates(geojson.coordinates)
}

const haversineKm = (from: [number, number], to: [number, number]) => {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const radiusKm = 6371
  const dLat = toRad(to[1] - from[1])
  const dLng = toRad(to[0] - from[0])
  const lat1 = toRad(from[1])
  const lat2 = toRad(to[1])
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const minDistanceKm = (from: [number, number][], to: [number, number][]) => {
  let minDistance = Number.POSITIVE_INFINITY
  from.forEach((fromCoordinate) => {
    to.forEach((toCoordinate) => {
      minDistance = Math.min(minDistance, haversineKm(fromCoordinate, toCoordinate))
    })
  })
  return minDistance
}

export const SelectionMap: React.FC<SelectionMapProps> = ({
  onSelect,
  onSelectSegment,
  onSelectPoint,
  simulationStart,
  simulationEnd,
  viewMode,
  onHover,
  disabled = false,
  style,
  blockedSegmentIds = [],
  focusRoad,
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

  const [hoveredRoadName, setHoveredRoadName] = useState<string | null>(null)
  const [hoveredSegmentIds, setHoveredSegmentIds] = useState<string[]>([])
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, coordinate: [number, number] } | null>(null)
  const [viewState, setViewState] = useState<any>({
    longitude: DEFAULT_MAP_CENTER[0],
    latitude: DEFAULT_MAP_CENTER[1],
    zoom: 14.5,
    pitch: 0,
    bearing: 0,
  })

  const containerRef = useRef<HTMLDivElement>(null)

  const tilesUrl = useMemo(() => {
    return `${apiOrigin}/api/v1/map/tiles/{z}/{x}/{y}.pbf?v=segment-id-text`
  }, [apiOrigin])

  const layers = useMemo(() => {
    const baseLayer: LayerProps = {
      id: 'segments-base',
      type: 'line',
      'source-layer': 'traffic_segments',
      paint: {
        'line-width': 3,
        'line-color': viewMode === 'forecast' ? '#D1D5DB' : '#40a9ff',
        'line-opacity': 0.8,
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
    }

    const blockedCasingLayer: LayerProps = {
      id: 'segments-blocked-casing',
      type: 'line',
      'source-layer': 'traffic_segments',
      paint: {
        'line-width': 8,
        'line-color': '#ffffff',
        'line-opacity': [
          'case',
          ['in', ['to-string', ['get', 'segmentId']], ['literal', blockedSegmentIds.map(String)]],
          0.8,
          0,
        ] as any,
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
    }

    const blockedLayer: LayerProps = {
      id: 'segments-blocked',
      type: 'line',
      'source-layer': 'traffic_segments',
      paint: {
        'line-width': 4,
        'line-color': '#0f172a',
        'line-opacity': [
          'case',
          ['in', ['to-string', ['get', 'segmentId']], ['literal', blockedSegmentIds.map(String)]],
          1.0,
          0,
        ] as any,
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
    }

    const activeHighlightIds = hoveredSegmentIds.length > 0
      ? hoveredSegmentIds
      : focusRoad?.segmentIds?.map(String) || []

    const highlightLayer: LayerProps = {
      id: 'segments-highlight',
      type: 'line',
      'source-layer': 'traffic_segments',
      paint: {
        'line-width': 5,
        'line-color': '#1890ff',
        'line-opacity': [
          'case',
          ['in', ['to-string', ['get', 'segmentId']], ['literal', activeHighlightIds]],
          0.8,
          0,
        ] as any,
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
    }

    return { baseLayer, highlightLayer, blockedLayer, blockedCasingLayer }
  }, [viewMode, blockedSegmentIds, hoveredSegmentIds, focusRoad?.segmentIds])

  useEffect(() => {
    const roadCoordinates = collectGeoJsonCoordinates(focusRoad?.geojson)
    const coordinates = roadCoordinates.length > 0
      ? roadCoordinates
      : focusRoad?.center
        ? [focusRoad.center]
        : []

    if (coordinates.length === 0) return

    const lngValues = coordinates.map(([lng]) => lng)
    const latValues = coordinates.map(([, lat]) => lat)
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngValues), Math.min(...latValues)],
      [Math.max(...lngValues), Math.max(...latValues)],
    ]
    const rect = containerRef.current?.getBoundingClientRect()

    if (
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      bounds[0][0] !== bounds[1][0] &&
      bounds[0][1] !== bounds[1][1]
    ) {
      const viewport = new WebMercatorViewport({
        width: rect.width,
        height: rect.height,
      })
      const { longitude, latitude, zoom } = viewport.fitBounds(bounds, {
        padding: 36,
        maxZoom: 16.5,
      })

      setViewState((prev: any) => ({
        ...prev,
        longitude,
        latitude,
        zoom,
        transitionDuration: 700,
        transitionInterpolator: new FlyToInterpolator() as any,
      }))
      return
    }

    const [longitude, latitude] = coordinates[0]
    setViewState((prev: any) => ({
      ...prev,
      longitude,
      latitude,
      zoom: Math.max(prev.zoom ?? 0, 14.5),
      transitionDuration: 700,
      transitionInterpolator: new FlyToInterpolator() as any,
    }))
  }, [focusRoad?.roadKey, focusRoad?.center?.[0], focusRoad?.center?.[1], focusRoad?.geojson])

  const getRenderedRoadSegmentIds = (event: any, feature: any): string[] => {
    const segmentId = String(feature.properties?.segmentId)

    if (onSelectSegment) {
      return [segmentId]
    }

    const roadName = feature.properties?.roadName || null
    const roadKey = feature.properties?.roadKey || null
    let renderedFeatures: any[] = []
    try {
      renderedFeatures = event.target?.queryRenderedFeatures?.(undefined, {
        layers: ['segments-base'],
      }) || []
    } catch {
      renderedFeatures = []
    }

    const candidates = renderedFeatures
      .map((renderedFeature: any) => {
        const renderedSegmentId = String(renderedFeature.properties?.segmentId || '')
        const renderedRoadName = renderedFeature.properties?.roadName || null
        const renderedRoadKey = renderedFeature.properties?.roadKey || null
        const isSameRoad = roadName
          ? renderedRoadName === roadName
          : roadKey && renderedRoadKey === roadKey
        const coordinates = collectCoordinates(renderedFeature.geometry?.coordinates)

        if (!renderedSegmentId || !isSameRoad || coordinates.length === 0) return null

        return {
          segmentId: renderedSegmentId,
          coordinates,
        }
      })
      .filter(Boolean) as Array<{ segmentId: string, coordinates: [number, number][] }>

    const segmentById = new Map(candidates.map((candidate) => [candidate.segmentId, candidate]))
    const cluster = new Set<string>(segmentById.has(segmentId) ? [segmentId] : [])

    let changed = true
    while (changed) {
      changed = false
      candidates.forEach((candidate) => {
        if (cluster.has(candidate.segmentId)) return

        const isConnected = Array.from(cluster).some((clusterSegmentId) => {
          const clusteredSegment = segmentById.get(clusterSegmentId)
          return clusteredSegment
            ? minDistanceKm(candidate.coordinates, clusteredSegment.coordinates) <= 1
            : false
        })

        if (isConnected) {
          cluster.add(candidate.segmentId)
          changed = true
        }
      })
    }

    return Array.from(cluster.size > 0 ? cluster : new Set([segmentId]))
  }

  const handleMouseMove = (e: any) => {
    if (disabled) return
    const feature = e.features?.[0]
    if (feature) {
      const roadKey = feature.properties?.roadKey || null
      const roadName = feature.properties?.roadName || null
      const segId = String(feature.properties?.segmentId)
      const segmentIds = getRenderedRoadSegmentIds(e, feature)

      setHoveredRoadName(roadName)
      setHoveredSegmentIds(segmentIds)

      if (onHover) {
        if (onSelectSegment) {
          onHover({
            roadName: `Segment ${segId} - ${roadName || 'Không tên'}`,
            segmentCount: 1,
            segmentIds: [segId],
          })
        } else {
          onHover({
            roadName: roadName || 'Trục đường không tên',
            roadKey: roadKey || undefined,
            segmentCount: segmentIds.length,
            segmentIds,
          })
        }
      }
    } else {
      setHoveredRoadName(null)
      setHoveredSegmentIds([])
      if (onHover) onHover(null)
    }
  }

  const handleClick = (e: any) => {
    if (disabled) return
    const feature = e.features?.[0]
    if (feature) {
      const segId = String(feature.properties.segmentId)
      const coordinate: [number, number] = [e.lngLat.lng, e.lngLat.lat]

      if (onSelectSegment) {
        onSelectSegment([segId])
      } else {
        const roadName = feature.properties?.roadName || 'Đường không tên'
        const roadKey = feature.properties?.roadKey
        const segmentIds = getRenderedRoadSegmentIds(e, feature)

        onSelect({
          roadName,
          roadKey,
          segmentCount: segmentIds.length,
          segmentIds,
          center: coordinate,
        })
      }
    }
    setContextMenu(null)
  }

  const handleContextMenu = (e: any) => {
    e.preventDefault()
    if (disabled) return
    setContextMenu({
      x: e.point.x,
      y: e.point.y,
      coordinate: [e.lngLat.lng, e.lngLat.lat]
    })
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <MapGL
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        style={{ width: '100%', height: '100%', borderRadius: 8 }}
        mapStyle={mapboxStyle}
        mapboxAccessToken={mapboxToken}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        interactiveLayerIds={disabled ? [] : ['segments-base']}
      >
        <Source
          id="selection-vector-source"
          type="vector"
          tiles={[tilesUrl]}
        >
          <Layer {...layers.baseLayer} />
          <Layer {...layers.highlightLayer} />
          <Layer id="segments-blocked-casing" {...(layers as any).blockedCasingLayer} />
          <Layer {...layers.blockedLayer} />
        </Source>

        {simulationStart && (
          <Marker longitude={simulationStart[0]} latitude={simulationStart[1]}>
            <EnvironmentFilled style={{ color: '#52c41a', fontSize: '24px' }} title="Điểm đi (Gốc)" />
          </Marker>
        )}
        {simulationEnd && (
          <Marker longitude={simulationEnd[0]} latitude={simulationEnd[1]}>
            <EnvironmentFilled style={{ color: '#cf1322', fontSize: '24px' }} title="Điểm đến (Đích)" />
          </Marker>
        )}
      </MapGL>

      {contextMenu && (
        <div style={{ position: 'absolute', left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}>
          <Menu
            items={[
              {
                key: 'start',
                label: 'Đặt làm điểm Gốc',
                onClick: () => {
                  if (onSelectPoint) onSelectPoint('start', contextMenu.coordinate)
                  setContextMenu(null)
                },
              },
              {
                key: 'end',
                label: 'Đặt làm điểm Đích',
                onClick: () => {
                  if (onSelectPoint) onSelectPoint('end', contextMenu.coordinate)
                  setContextMenu(null)
                },
              },
              {
                key: 'close',
                label: 'Đóng menu',
                danger: true,
                onClick: () => setContextMenu(null)
              }
            ]}
            style={{ borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          />
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }}>
        <Card
          size="small"
          style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {disabled
              ? 'Vui lòng bấm Quay lại Hiện tại để thao tác.'
              : hoveredRoadName
                ? `Chọn: ${hoveredRoadName}`
                : onSelectSegment ? 'Chọn Segment để ĐÓNG/MỞ' : 'Click chọn trục đường / Chuột phải chọn O-D'}
          </Text>
        </Card>
      </div>
    </div>
  )
}
