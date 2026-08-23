import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core'
import { GeoJsonLayer } from '@deck.gl/layers'
import { MapboxOverlay, MapboxOverlayProps } from '@deck.gl/mapbox'
import { Typography, Menu } from 'antd'
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import ReactMapGL, { Source, Layer, LayerProps, Marker, useControl } from 'react-map-gl'
import { EnvironmentFilled } from '@ant-design/icons'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/config/constants'
import { PredictionItem } from '@/types'

const { Text, Title } = Typography

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const MAP_STYLE = import.meta.env.VITE_MAPBOX_STYLE

// Custom hook to use MapboxOverlay with react-map-gl (Recommended for v7/v9)
function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

interface PredictiveMapProps {
  segmentData?: any
  predictionData?: PredictionItem[]
  viewMode?: 'real-time' | 'forecast' | 'simulation'
  selectedRoad?: {
    roadName: string
    roadKey?: string
    segmentCount: number
    segmentIds: string[]
    center?: [number, number]
    geojson?: any
  } | null
  isLoading?: boolean
  style?: React.CSSProperties
  blockedSegmentIds?: string[]
  simulatedRoute?: any
  simulatedRouteColor?: [number, number, number, number]
  simulationStart?: [number, number] | null
  simulationEnd?: [number, number] | null
  onSelectPoint?: (type: 'start' | 'end', point: [number, number]) => void
  showSummaryCard?: boolean
}

const LOS_COLORS: Record<number, string> = {
  0: '#22c55e', // A
  1: '#84cc16', // B
  2: '#eab308', // C
  3: '#f97316', // D
  4: '#ef4444', // E
  5: '#7f1d1d', // F
}

const formatForecastTime = (forecastTime?: string): string => {
  if (!forecastTime) return 'Không rõ'
  const date = new Date(forecastTime)
  if (Number.isNaN(date.getTime())) return forecastTime

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

const collectCoordinates = (value: unknown): [number, number][] => {
  if (!Array.isArray(value)) return []
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [[value[0] as number, value[1] as number]]
  }
  return value.flatMap((item) => collectCoordinates(item))
}

const collectGeoJsonCoordinates = (geojson: any): [number, number][] => {
  if (!geojson) return []
  if (geojson.type === 'FeatureCollection') {
    return (geojson.features || []).flatMap((feature: any) =>
      collectGeoJsonCoordinates(feature)
    )
  }
  if (geojson.type === 'Feature') {
    return collectGeoJsonCoordinates(geojson.geometry)
  }
  return collectCoordinates(geojson.coordinates)
}

export const PredictiveMap: React.FC<PredictiveMapProps> = ({
  predictionData = [],
  viewMode = 'real-time',
  selectedRoad,
  style,
  blockedSegmentIds = [],
  simulatedRoute,
  simulatedRouteColor,
  simulationStart,
  simulationEnd,
  onSelectPoint,
}) => {
  const [hoverInfo, setHoverInfo] = useState<any>(null)
  const [lastCoordinate, setLastCoordinate] = useState<[number, number] | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, coordinate: [number, number] } | null>(null)
  const [opacityPhase, setOpacityPhase] = useState(1.0)
  const containerRef = useRef<HTMLDivElement>(null)

  const [viewState, setViewState] = useState({
    longitude: DEFAULT_MAP_CENTER[0],
    latitude: DEFAULT_MAP_CENTER[1],
    zoom: DEFAULT_MAP_ZOOM,
    pitch: 45,
    bearing: 0,
  })

  useEffect(() => {
    setHoverInfo(null)
    setContextMenu(null)
    setLastCoordinate(null)
  }, [viewMode])

  // Blinking effect
  useEffect(() => {
    const shouldBlink = (viewMode === 'forecast' && predictionData.length > 0) ||
                        (viewMode === 'simulation' && simulatedRoute)

    if (shouldBlink) {
      const interval = setInterval(() => {
        setOpacityPhase(v => (v === 1.0 ? 0.3 : 1.0))
      }, 700)
      return () => clearInterval(interval)
    } else {
      setOpacityPhase(prev => prev !== 1.0 ? 1.0 : prev)
    }
  }, [viewMode, predictionData.length, simulatedRoute])

  // Fly-to logic
  useEffect(() => {
    const routeCoordinates = collectGeoJsonCoordinates(simulatedRoute)
    const roadCoordinates = collectGeoJsonCoordinates(selectedRoad?.geojson)
    const odCoordinates = [simulationStart, simulationEnd].filter(Boolean) as [number, number][]
    const baseCoordinates =
      routeCoordinates.length > 0
        ? routeCoordinates
        : roadCoordinates.length > 0
          ? roadCoordinates
          : selectedRoad?.center
            ? [selectedRoad.center]
            : []
    const coordinates = [...baseCoordinates, ...odCoordinates]

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
        padding: 48,
        maxZoom: 16,
      })

      setViewState(prev => ({
        ...prev,
        longitude,
        latitude,
        zoom,
        transitionDuration: 1200,
        transitionInterpolator: new FlyToInterpolator() as any,
      }))
    }
  }, [
    selectedRoad?.roadKey,
    selectedRoad?.center,
    selectedRoad?.geojson,
    simulatedRoute,
    simulationStart,
    simulationEnd,
  ])

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
  const tilesUrl = useMemo(() => {
    const origin = apiBaseUrl.startsWith('http') ? new URL(apiBaseUrl).origin : window.location.origin
    return `${origin}/api/v1/map/tiles/{z}/{x}/{y}.pbf?v=segment-id-text`
  }, [apiBaseUrl])

  const forecastMap = useMemo(() => {
    const fMap = new Map<string, PredictionItem>()
    predictionData.forEach(item => {
      fMap.set(String(item.segment_id), item)
    })
    return fMap
  }, [predictionData])

  const vectorLayers = useMemo(() => {
    const layers: LayerProps[] = []
    const relevantSegmentIds = new Set<string>()
    forecastMap.forEach((_, id) => relevantSegmentIds.add(id))
    if (selectedRoad) {
      selectedRoad.segmentIds.forEach(id => relevantSegmentIds.add(String(id)))
    }
    blockedSegmentIds.forEach(id => relevantSegmentIds.add(String(id)))

    const pairs: string[] = []
    forecastMap.forEach((pred, id) => {
      pairs.push(id)
      pairs.push(LOS_COLORS[Number(pred.congestion_level)] || '#94a3b8')
    })

    layers.push({
      id: 'predictive-base-layer',
      type: 'line',
      'source-layer': 'traffic_segments',
      paint: {
        'line-width': viewMode === 'forecast' ? 8 : 6,
        'line-color': viewMode === 'forecast' && pairs.length > 0
          ? [
              'match',
              ['to-string', ['get', 'segmentId']],
              ...pairs,
              '#e2e8f0'
            ] as any
          : [
              'match',
              ['get', 'losGrade'],
              'A', '#22c55e', '0', '#22c55e',
              'B', '#84cc16', '1', '#84cc16',
              'C', '#eab308', '2', '#eab308',
              'D', '#f97316', '3', '#f97316',
              'E', '#ef4444', '4', '#ef4444',
              'F', '#7f1d1d', '5', '#7f1d1d',
              '#cbd5e1'
            ] as any,
        'line-opacity': [
          'case',
          ['in', ['to-string', ['get', 'segmentId']], ['literal', Array.from(relevantSegmentIds)]],
          viewMode === 'forecast' && forecastMap.size > 0
            ? ['case', ['in', ['to-string', ['get', 'segmentId']], ['literal', Array.from(forecastMap.keys())]], opacityPhase, 0.5] as any
            : 0.95,
          0
        ] as any,
        'line-blur': viewMode === 'forecast' ? 1.0 : 0,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' }
    })

    if (viewMode !== 'forecast' && (viewMode === 'simulation' || blockedSegmentIds.length > 0)) {
      // White casing for blocked roads
      layers.push({
        id: 'predictive-blocked-casing',
        type: 'line',
        'source-layer': 'traffic_segments',
        paint: {
          'line-width': 10,
          'line-color': '#ffffff',
          'line-opacity': [
            'case',
            ['in', ['to-string', ['get', 'segmentId']], ['literal', blockedSegmentIds.map(String)]],
            0.8,
            0
          ] as any
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' }
      })
      // Core black line
      layers.push({
        id: 'predictive-blocked-layer',
        type: 'line',
        'source-layer': 'traffic_segments',
        paint: {
          'line-width': 6,
          'line-color': '#0f172a', // Slate-900 for premium feel
          'line-opacity': [
            'case',
            ['in', ['to-string', ['get', 'segmentId']], ['literal', blockedSegmentIds.map(String)]],
            1.0,
            0
          ] as any
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' }
      })
    }
    return layers
  }, [viewMode, forecastMap, blockedSegmentIds, opacityPhase, selectedRoad])

  const deckLayers = useMemo(() => {
    const list: any[] = []
    if (simulatedRoute && viewMode !== 'forecast') {
      const baseColor = simulatedRouteColor || [114, 46, 209, 255]
      const routeOpacity = viewMode === 'simulation' ? opacityPhase : 1
      const routeColor: [number, number, number, number] = [
        baseColor[0], baseColor[1], baseColor[2],
        Math.round((baseColor[3] ?? 255) * routeOpacity),
      ]

      list.push(
        new GeoJsonLayer({
          id: 'simulated-route-glow-outer',
          data: simulatedRoute,
          pickable: false,
          stroked: true,
          filled: false,
          lineWidthMinPixels: 18,
          getLineColor: [baseColor[0], baseColor[1], baseColor[2], 40],
          getLineWidth: 20,
        }),
        new GeoJsonLayer({
          id: 'simulated-route-glow-inner',
          data: simulatedRoute,
          pickable: false,
          stroked: true,
          filled: false,
          lineWidthMinPixels: 12,
          getLineColor: [baseColor[0], baseColor[1], baseColor[2], 90],
          getLineWidth: 14,
        }),
        new GeoJsonLayer({
          id: 'simulated-route-casing',
          data: simulatedRoute,
          pickable: false,
          stroked: true,
          filled: false,
          lineWidthMinPixels: 9,
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 10,
        }),
        new GeoJsonLayer({
          id: 'simulated-route-deck',
          data: simulatedRoute,
          pickable: true,
          stroked: true,
          filled: false,
          lineWidthMinPixels: 6,
          getLineColor: routeColor,
          getLineWidth: 7,
        })
      )
    }
    return list
  }, [simulatedRoute, simulatedRouteColor, opacityPhase, viewMode])

  const onHover = useCallback((e: any) => {
    const feature = e.features?.[0]
    if (feature) {
      const segId = feature.properties.segmentId
      const predInfo = forecastMap.get(String(segId))
      setHoverInfo({
        x: e.point.x,
        y: e.point.y,
        properties: { ...feature.properties, predictionInfo: predInfo }
      })
      setLastCoordinate([e.lngLat.lng, e.lngLat.lat])
    } else {
      setHoverInfo(null)
    }
  }, [forecastMap])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <ReactMapGL
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle={MAP_STYLE}
        mapboxAccessToken={MAPBOX_TOKEN}
        onMouseMove={onHover}
        onContextMenu={(e: any) => {
          if (!onSelectPoint) return
          e.preventDefault()
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect && lastCoordinate) {
            setContextMenu({
              x: e.point.x,
              y: e.point.y,
              coordinate: [e.lngLat.lng, e.lngLat.lat]
            })
          }
        }}
        onClick={() => setContextMenu(null)}
        interactiveLayerIds={['predictive-base-layer']}
      >
        <DeckGLOverlay layers={deckLayers} />

        <Source id="predictive-vector-source" type="vector" tiles={[tilesUrl]}>
          {vectorLayers.map(layer => <Layer key={layer.id} {...layer} />)}
        </Source>

        {selectedRoad?.geojson && (
          <Source id="selected-road-source" type="geojson" data={selectedRoad.geojson}>
            <Layer
              id="selected-road-layer"
              type="line"
              paint={{
                'line-width': viewMode === 'forecast' ? 10 : 8,
                'line-color': [
                  'match',
                  ['to-number', ['get', 'losNumeric']],
                  0, '#22c55e', 1, '#84cc16', 2, '#eab308', 3, '#f97316', 4, '#ef4444', 5, '#7f1d1d', '#22c55e'
                ] as any,
                'line-opacity': viewMode === 'forecast' ? 0.6 : 0.95,
                'line-blur': viewMode === 'forecast' ? 1.0 : 0
              }}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
          </Source>
        )}

        {viewMode === 'forecast' && predictionData.length > 0 && selectedRoad?.geojson && (
          <Source id="forecast-road-source" type="geojson" data={selectedRoad.geojson}>
            <Layer
              id="forecast-road-layer"
              type="line"
              paint={{
                'line-width': 10,
                'line-color': [
                  'match',
                  ['to-string', ['get', 'segmentId']],
                  ...(() => {
                      const pairs: string[] = []
                      forecastMap.forEach((pred, id) => {
                        pairs.push(id)
                        pairs.push(LOS_COLORS[Number(pred.congestion_level)] || '#94a3b8')
                      })
                      return pairs
                  })(),
                  'transparent'
                ] as any,
                'line-opacity': opacityPhase,
                'line-blur': 1.5,
              }}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            />
          </Source>
        )}

        {simulationStart && (
          <Marker longitude={simulationStart[0]} latitude={simulationStart[1]} anchor="bottom">
            <EnvironmentFilled style={{ color: '#52c41a', fontSize: '24px' }} title="Điểm đi (Gốc)" />
          </Marker>
        )}
        {simulationEnd && (
          <Marker longitude={simulationEnd[0]} latitude={simulationEnd[1]} anchor="bottom">
            <EnvironmentFilled style={{ color: '#cf1322', fontSize: '24px' }} title="Điểm đến (Đích)" />
          </Marker>
        )}
      </ReactMapGL>

      {hoverInfo && (
        <div
          className="deckgl-tooltip"
          style={{
            position: 'absolute',
            zIndex: 100,
            pointerEvents: 'none',
            left: hoverInfo.x,
            top: hoverInfo.y,
            backgroundColor: 'white',
            padding: '8px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            maxWidth: '280px'
          }}
        >
          <Title level={5} style={{ margin: 0, fontSize: '14px' }}>
            {hoverInfo.properties.name || hoverInfo.properties.roadName || 'Đoạn đường'}
          </Title>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            ID: {hoverInfo.properties.segmentId} | Tốc độ: {hoverInfo.properties.speed || hoverInfo.properties.current_speed_kmh || 0} km/h
          </Text>
          {hoverInfo.properties.predictionInfo && (
            <div style={{ marginTop: '8px', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: LOS_COLORS[hoverInfo.properties.predictionInfo.congestion_level] }} />
                <Text strong style={{ fontSize: '13px' }}>
                  Dự báo: LOS {['A','B','C','D','E','F'][hoverInfo.properties.predictionInfo.congestion_level]}
                </Text>
              </div>
              <Text style={{ fontSize: '12px', display: 'block', color: '#595959', fontStyle: 'italic' }}>
                Thời gian: {formatForecastTime(hoverInfo.properties.predictionInfo.forecast_for_time)}
              </Text>
            </div>
          )}
        </div>
      )}

      {contextMenu && (
        <div style={{ position: 'absolute', left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}>
          <Menu
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)', borderRadius: '4px' }}
            onClick={({ key }) => {
              onSelectPoint?.(key as 'start' | 'end', contextMenu.coordinate)
              setContextMenu(null)
            }}
          >
            <Menu.Item key="start">Chọn điểm Gốc</Menu.Item>
            <Menu.Item key="end">Chọn điểm Đích</Menu.Item>
          </Menu>
        </div>
      )}
    </div>
  )
}
