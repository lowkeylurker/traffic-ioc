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

const LOS_COLOR_MAP: Record<number, [number, number, number, number]> = {
  0: [34, 197, 94, 255],
  1: [234, 179, 8, 255],
  2: [249, 115, 22, 255],
  3: [239, 68, 68, 255],
}

const LOS_TEXT_MAP: Record<
  number,
  { los: 'A' | 'B' | 'C' | 'D'; label: string }
> = {
  0: { los: 'A', label: 'Thông thoáng' },
  1: { los: 'B', label: 'Ổn định' },
  2: { los: 'C', label: 'Đông đúc' },
  3: { los: 'D', label: 'Ùn tắc cao' },
}

const getReasonDescription = (
  reasonCode?: string,
  usedFallback?: boolean
): string => {
  if (!reasonCode) {
    return usedFallback
      ? 'Hệ thống đã dùng nguồn thay thế gần nhất để đảm bảo có dự báo.'
      : 'Hệ thống đánh giá theo biểu hiện lưu thông gần nhất trên đoạn đường này.'
  }

  const normalized = reasonCode.toUpperCase()

  if (normalized.includes('INCIDENT'))
    return 'Ảnh hưởng sự cố giao thông làm tốc độ giảm đáng kể.'
  if (normalized.includes('PEAK'))
    return 'Khung giờ cao điểm khiến lưu lượng tăng.'
  if (normalized.includes('WEATHER'))
    return 'Điều kiện thời tiết không thuận lợi ảnh hưởng tốc độ.'
  if (normalized.includes('FALLBACK') || usedFallback) {
    return 'Hệ thống sử dụng mẫu lưu thông từ đoạn đường tương đồng vì dữ liệu trực tiếp còn thiếu.'
  }
  if (normalized.includes('HISTORICAL'))
    return 'Dự báo dựa trên mẫu lịch sử cùng khung giờ và ngày tương tự.'

  return 'Dự báo tổng hợp từ mô hình AI trên dữ liệu giao thông hiện tại và lịch sử.'
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

const isValidCoordPair = (coord: unknown): coord is [number, number] => {
  if (!Array.isArray(coord) || coord.length < 2) return false
  const lng = Number(coord[0])
  const lat = Number(coord[1])
  return Number.isFinite(lng) && Number.isFinite(lat)
}

const extractLineCoordinates = (coordinates: unknown): [number, number][] => {
  if (!Array.isArray(coordinates)) return []

  if (coordinates.every((item) => isValidCoordPair(item))) {
    return (coordinates as unknown[]).filter(isValidCoordPair)
  }

  const flattened: [number, number][] = []
  for (const part of coordinates) {
    flattened.push(...extractLineCoordinates(part))
  }
  return flattened
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
  const segmentData =
    propSegmentData !== undefined ? propSegmentData : hookSegments
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

    const selectedSegmentIds = new Set(
      selectedRoad.segmentIds.map((id) => Number(id))
    )
    const selectedSegments = segmentData.features.filter((f) =>
      selectedSegmentIds.has(Number(f.properties.segmentId))
    )

    if (selectedSegments.length === 0) return

    // Calculate center for each segment and finding the overall centroid
    const centers = selectedSegments
      .map((f) => {
        const validCoords = extractLineCoordinates(f.geometry?.coordinates)
        if (validCoords.length === 0) return null

        const midIdx = Math.floor(validCoords.length / 2)
        const [lng, lat] = validCoords[midIdx]

        return { lng, lat }
      })
      .filter((c): c is { lng: number; lat: number } => c !== null)

    if (centers.length > 0) {
      // Calculate overall centroid of the centers
      const centroid = centers.reduce(
        (acc, c) => ({
          lng: acc.lng + c.lng,
          lat: acc.lat + c.lat,
        }),
        { lng: 0, lat: 0 }
      )

      centroid.lng /= centers.length
      centroid.lat /= centers.length

      // Pick the segment closest to the centroid as the representative fly-to target
      const representative = centers.reduce((best, current) => {
        const bestDist =
          Math.pow(best.lng - centroid.lng, 2) +
          Math.pow(best.lat - centroid.lat, 2)
        const currentDist =
          Math.pow(current.lng - centroid.lng, 2) +
          Math.pow(current.lat - centroid.lat, 2)
        return currentDist < bestDist ? current : best
      })

      if (
        !Number.isFinite(representative.lng) ||
        !Number.isFinite(representative.lat)
      )
        return

      setViewState((prev) => {
        const isSame =
          Math.abs(prev.longitude - representative.lng) < 0.0001 &&
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

    const featureBySegmentId = new globalThis.Map<number, GeoJSONFeature>()
    segmentData.features.forEach((feature) => {
      featureBySegmentId.set(Number(feature.properties.segmentId), feature)
    })

    // Forecast mode: build GeoJSON directly from prediction response
    if (viewMode === 'forecast' && predictionData.length > 0) {
      const forecastFeatures = predictionData
        .map((prediction) => {
          const segId = Number(prediction.segment_id)
          const baseFeature = featureBySegmentId.get(segId)
          if (!baseFeature) return null

          const validCoords = extractLineCoordinates(
            baseFeature.geometry?.coordinates
          )
          if (validCoords.length < 2) return null

          return {
            ...baseFeature,
            geometry: {
              ...baseFeature.geometry,
              type: 'LineString',
              coordinates: validCoords,
            },
            properties: {
              ...baseFeature.properties,
              segmentName:
                baseFeature.properties.segmentName || `Segment ${segId}`,
              congestionLevel: Number(prediction.congestion_level),
              predictionInfo: prediction,
            },
          }
        })
        .filter(Boolean)

      return {
        type: 'FeatureCollection',
        features: forecastFeatures as GeoJSONFeature[],
      } as SegmentResponse
    }

    // Real-time mode: show selected road segments only
    if (!selectedRoad) {
      return { type: 'FeatureCollection', features: [] } as SegmentResponse
    }

    const selectedSegmentIds = new Set(
      selectedRoad.segmentIds.map((id) => Number(id))
    )
    const selectedFeatures = segmentData.features
      .filter((f) => selectedSegmentIds.has(Number(f.properties.segmentId)))
      .map((f) => {
        const segId = Number(f.properties.segmentId)
        const validCoords = extractLineCoordinates(f.geometry?.coordinates)
        if (validCoords.length < 2) return null

        return {
          ...f,
          geometry: {
            ...f.geometry,
            type: 'LineString',
            coordinates: validCoords,
          },
          properties: {
            ...f.properties,
            segmentName: f.properties.segmentName || `Segment ${segId}`,
            congestionLevel: -1,
            predictionInfo: undefined,
          },
        }
      })
      .filter(Boolean)

    return {
      type: 'FeatureCollection',
      features: selectedFeatures as GeoJSONFeature[],
    } as SegmentResponse
  }, [segmentData, predictionData, viewMode, selectedRoad])

  const getLineColor = React.useCallback(
    (f: any): [number, number, number, number] => {
      const props = (f.properties || {}) as FeatureProperties
      const level = props.congestionLevel
      const opacity = isLoading ? (blink ? 255 : 50) : 255

      if (level === -1)
        return viewMode === 'forecast'
          ? [156, 163, 175, opacity]
          : [24, 144, 255, opacity]

      if (level in LOS_COLOR_MAP) {
        const [r, g, b] = LOS_COLOR_MAP[level]
        return [r, g, b, opacity]
      }

      return [100, 100, 100, opacity]
    },
    [blink, isLoading, viewMode]
  )

  const layers = useMemo(() => {
    if (!combinedGeoJson) return []

    return [
      new GeoJsonLayer({
        id: 'predictive-traffic-lines',
        data: combinedGeoJson,
        pickable: true,
        stroked: true,
        filled: false,
        lineWidthScale: 1,
        lineWidthMinPixels: 4,
        lineWidthMaxPixels: 12,
        getLineColor,
        getLineWidth: 6,
        updateTriggers: {
          getLineColor: [
            getLineColor,
            blink,
            isLoading,
            predictionData,
            viewMode,
          ],
        },
        onHover: (info) => setHoverInfo(info as any),
      }),
    ]
  }, [
    combinedGeoJson,
    getLineColor,
    blink,
    isLoading,
    predictionData,
    viewMode,
  ])

  const renderTooltip = () => {
    if (!hoverInfo || !hoverInfo.object) return null
    const props = hoverInfo.object.properties as unknown as FeatureProperties
    const predInfo = props.predictionInfo
    const congestionLevel = Number(predInfo?.congestion_level)
    const losInfo = LOS_TEXT_MAP[congestionLevel]
    const readableDescription =
      predInfo?.status_description ||
      'Dự báo cho thấy lưu thông có dấu hiệu chậm hơn bình thường.'
    const reasonDescription = getReasonDescription(
      predInfo?.reason_code,
      predInfo?.used_fallback
    )

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
        <div
          style={{
            fontWeight: 'bold',
            fontSize: '14px',
            marginBottom: '8px',
            color: '#1f2937',
            borderBottom: '1px solid #f0f0f0',
            paddingBottom: '4px',
          }}
        >
          {props.segmentName}
        </div>

        {predInfo ? (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontSize: '13px', color: '#4b5563' }}>
                Mức phục vụ (LOS):
              </span>
              <span style={{ fontWeight: 'bold', color: '#1f2937' }}>
                {losInfo
                  ? `LOS ${losInfo.los} - ${losInfo.label}`
                  : `Muc ${predInfo.congestion_level}`}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '4px',
              }}
            >
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                Thời điểm dự báo:
              </span>
              <span
                style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}
              >
                {formatForecastTime(predInfo.forecast_for_time)}
              </span>
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#374151',
                marginBottom: '6px',
              }}
            >
              <strong>Diễn giải:</strong> {readableDescription}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#4b5563',
                marginBottom: '4px',
              }}
            >
              <strong>Nguyên nhân chính:</strong> {reasonDescription}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Mã tham chiếu:{' '}
              <span style={{ color: '#6b7280' }}>
                {predInfo.reason_code || 'Không có'}
              </span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            Đoạn này chưa có kết quả dự báo trong lần chạy hiện tại.
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: nextViewState }: any) =>
          setViewState(nextViewState)
        }
        controller={true}
        layers={layers as any[]}
      >
        <Map mapStyle={MAP_STYLE} mapboxAccessToken={MAPBOX_TOKEN} reuseMaps />
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
            <Title
              level={5}
              style={{ margin: 0, fontSize: '14px', color: '#1890ff' }}
            >
              {selectedRoad.roadName}
            </Title>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Số phân đoạn:
              </Text>
              <Text strong style={{ fontSize: '12px' }}>
                {selectedRoad.segmentCount}
              </Text>
            </div>
            {viewMode === 'forecast' && (
              <div
                style={{
                  marginTop: 4,
                  paddingTop: 4,
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                <Text type="danger" strong style={{ fontSize: '12px' }}>
                  Dữ liệu dự báo (15p)
                </Text>
              </div>
            )}
            {isLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <Spin size="small" />
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  Đang chạy mô phỏng...
                </Text>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Legend */}
      {viewMode === 'forecast' && predictionData.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            backgroundColor: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 10,
            fontSize: '11px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Chú giải (Tình trạng kẹt xe)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: '#22c55e',
                  borderRadius: '2px',
                }}
              />
              <span>0 - LOS A: Thông thoáng</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: '#eab308',
                  borderRadius: '2px',
                }}
              />
              <span>1 - LOS B: Ổn định</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: '#f97316',
                  borderRadius: '2px',
                }}
              />
              <span>2 - LOS C: Đông đúc</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: '#ef4444',
                  borderRadius: '2px',
                }}
              />
              <span>3 - LOS D: Ùn tắc cao</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
