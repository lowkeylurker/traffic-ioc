import { FlyToInterpolator } from '@deck.gl/core'
import { GeoJsonLayer } from '@deck.gl/layers'
import DeckGL from '@deck.gl/react'
import { Card, Spin, Typography } from 'antd'
import React, { useEffect, useMemo, useState } from 'react'
import Map from 'react-map-gl'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/config/constants'
import { useSegments } from '@/hooks/useTraffic'
import { GeoJSONFeature, SegmentResponse, PredictionItem } from '@/types'

const { Text, Title } = Typography

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const MAP_STYLE = import.meta.env.VITE_MAPBOX_STYLE

interface PredictiveMapProps {
  segmentData?: SegmentResponse | null
  predictionData?: PredictionItem[]
  viewMode?: 'real-time' | 'forecast'
  selectedRoad?: {
    roadName: string
    roadKey?: string
    segmentCount: number
    segmentIds: number[]
  } | null
  isLoading?: boolean
  style?: React.CSSProperties
}

interface FeatureProperties {
  segmentId: number
  segmentName: string
  congestionLevel: number
  predictionInfo?: PredictionItem
}

export const PredictiveMap: React.FC<PredictiveMapProps> = ({
  segmentData: propSegmentData,
  predictionData: propPredictionData = [],
  viewMode = 'real-time',
  selectedRoad,
  isLoading = false,
  style,
}) => {
  const hookSegments = useSegments()
  const segmentData = propSegmentData !== undefined ? propSegmentData : hookSegments
  const predictionData = propPredictionData

  const [hoverInfo, setHoverInfo] = useState<{
    x: number
    y: number
    object: GeoJSONFeature | null
  } | null>(null)

  const [viewState, setViewState] = useState({
    longitude: DEFAULT_MAP_CENTER[0],
    latitude: DEFAULT_MAP_CENTER[1],
    zoom: DEFAULT_MAP_ZOOM,
    pitch: 45,
    bearing: 0,
    transitionDuration: 0,
    transitionInterpolator: new FlyToInterpolator(),
  })

  // Fly-to effect when selectedRoad changes
  useEffect(() => {
    if (!selectedRoad || !segmentData) return

    const selectedSegmentIds = selectedRoad.segmentIds
    const selectedSegments = segmentData.features.filter((f) =>
      selectedSegmentIds.includes(f.properties.segmentId)
    )

    if (selectedSegments.length === 0) return

    // Calculate center for each segment and finding the overall centroid
    const centers = selectedSegments.map(f => {
      const coords = f.geometry.coordinates as [number, number][]
      if (!coords || coords.length === 0) return null
      
      const midIdx = Math.floor(coords.length / 2)
      return {
        lng: coords[midIdx][0],
        lat: coords[midIdx][1]
      }
    }).filter((c): c is { lng: number; lat: number } => c !== null)

    if (centers.length > 0) {
      // Calculate overall centroid of the centers
      const centroid = centers.reduce((acc, c) => ({
        lng: acc.lng + c.lng,
        lat: acc.lat + c.lat
      }), { lng: 0, lat: 0 })

      centroid.lng /= centers.length
      centroid.lat /= centers.length

      // Pick the segment closest to the centroid as the representative fly-to target
      const representative = centers.reduce((best, current) => {
        const bestDist = Math.pow(best.lng - centroid.lng, 2) + Math.pow(best.lat - centroid.lat, 2)
        const currentDist = Math.pow(current.lng - centroid.lng, 2) + Math.pow(current.lat - centroid.lat, 2)
        return currentDist < bestDist ? current : best
      })

      setViewState((prev) => {
        const isSame = Math.abs(prev.longitude - representative.lng) < 0.0001 && 
                      Math.abs(prev.latitude - representative.lat) < 0.0001 && 
                      prev.zoom === 14
        
        if (isSame) return prev
        
        return {
          ...prev,
          longitude: representative.lng,
          latitude: representative.lat,
          zoom: 14,
          transitionDuration: 1000,
          transitionInterpolator: new FlyToInterpolator(),
        }
      })
    }
  }, [selectedRoad, segmentData])

  const [blink, setBlink] = useState(true)
  useEffect(() => {
    let interval: any = null
    
    if (isLoading) {
      interval = setInterval(() => {
        setBlink((b) => !b)
      }, 400)
    } else {
      setBlink(true)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isLoading])

  const combinedGeoJson = useMemo(() => {
    if (!segmentData) return null
    if (!selectedRoad) return { type: 'FeatureCollection', features: [] }

    const features = segmentData.features
      .filter((f: GeoJSONFeature) => {
        return selectedRoad.segmentIds.includes(f.properties.segmentId)
      })
      .map((f: GeoJSONFeature) => {
        const segId = f.properties.segmentId
        const predStatus = predictionData.find((p) => p.segment_id === segId)

        let congestionLevel = -1
        if (viewMode === 'forecast' && predStatus) {
          congestionLevel = predStatus.congestion_level
        }

        return {
          ...f,
          properties: {
            ...f.properties,
            congestionLevel,
            predictionInfo: predStatus,
          },
        }
      })

    return { type: 'FeatureCollection', features } as any
  }, [segmentData, predictionData, viewMode, selectedRoad])

  const getLineColor = React.useCallback((f: any): [number, number, number, number] => {
    const props = (f.properties || {}) as FeatureProperties
    const level = props.congestionLevel
    const opacity = isLoading ? (blink ? 255 : 50) : 255

    if (level === -1) return [24, 144, 255, opacity]

    if (level === 0) return [34, 197, 94, opacity]
    if (level === 1) return [234, 179, 8, opacity]
    if (level === 2) return [249, 115, 22, opacity]
    if (level >= 3) return [239, 68, 68, opacity]
    
    return [100, 100, 100, opacity]
  }, [blink, isLoading])

  const layers = useMemo(() => {
    if (!combinedGeoJson) return []

    return [
      new GeoJsonLayer({
        id: 'predictive-traffic-lines',
        data: combinedGeoJson,
        pickable: true,
        stroked: false,
        filled: false,
        lineWidthScale: 1,
        lineWidthMinPixels: 4,
        lineWidthMaxPixels: 12,
        getLineColor,
        getLineWidth: 6,
        updateTriggers: {
          getLineColor: [getLineColor, blink, isLoading, predictionData, viewMode],
        },
        onHover: (info) => setHoverInfo(info as any),
      }),
    ]
  }, [combinedGeoJson, getLineColor, blink, isLoading, predictionData, viewMode])

  const renderTooltip = () => {
    if (!hoverInfo || !hoverInfo.object) return null
    const props = hoverInfo.object.properties as unknown as FeatureProperties
    const predInfo = props.predictionInfo

    return (
      <div
        className="deckgl-tooltip"
        style={{
          position: 'absolute',
          zIndex: 100,
          pointerEvents: 'none',
          left: hoverInfo.x + 15,
          top: hoverInfo.y + 15,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          padding: '12px 16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontFamily: 'sans-serif',
          minWidth: '240px',
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: '#1f2937', borderBottom: '1px solid #f0f0f0', paddingBottom: '4px' }}>
          {props.segmentName}
        </div>
        
        {predInfo ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px', color: '#4b5563' }}>Mức độ kẹt xe:</span>
              <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{predInfo.congestion_level}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic', marginBottom: '4px' }}>
              {predInfo.status_description}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Mã lý do: <span style={{ color: '#6b7280' }}>{predInfo.reason_code}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Dữ liệu hiện tại / Chưa có dự báo</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: nextViewState }: any) => setViewState(nextViewState)}
        controller={true}
        layers={layers as any[]}
      >
        <Map
          mapStyle={MAP_STYLE}
          mapboxAccessToken={MAPBOX_TOKEN}
          reuseMaps
        />
        {renderTooltip()}
      </DeckGL>

      {/* Road Info Overlay (Top Right) */}
      {selectedRoad && (
        <Card
          size="small"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 240,
            zIndex: 10,
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            border: 'none',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Title level={5} style={{ margin: 0, fontSize: '14px', color: '#1890ff' }}>
              {selectedRoad.roadName}
            </Title>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>Số phân đoạn:</Text>
              <Text strong style={{ fontSize: '12px' }}>{selectedRoad.segmentCount}</Text>
            </div>
            {viewMode === 'forecast' && (
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #f0f0f0' }}>
                <Text type="danger" strong style={{ fontSize: '12px' }}>Dữ liệu dự báo (15p)</Text>
              </div>
            )}
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Spin size="small" />
                <Text type="secondary" style={{ fontSize: '11px' }}>Đang chạy mô phỏng...</Text>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Legend */}
      {viewMode === 'forecast' && predictionData.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          backgroundColor: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          zIndex: 10,
          fontSize: '11px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Chú giải (Tình trạng kẹt xe)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, backgroundColor: '#22c55e', borderRadius: '2px' }} />
              <span>0: Thông thoáng</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, backgroundColor: '#eab308', borderRadius: '2px' }} />
              <span>1: Bình thường</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, backgroundColor: '#f97316', borderRadius: '2px' }} />
              <span>2: Đông đúc</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, backgroundColor: '#ef4444', borderRadius: '2px' }} />
              <span>3: Kẹt xe</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
