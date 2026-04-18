import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/config/constants'
import { useSegments, useTrafficStatus } from '@/hooks/useTraffic'
import { predictionApi } from '@/services/api'
import { GeoJSONFeature, SegmentResponse, TrafficStatus, PredictionItem } from '@/types'
import { PathStyleExtension } from '@deck.gl/extensions'
import { GeoJsonLayer } from '@deck.gl/layers'
import DeckGL from '@deck.gl/react'
import { Card, Slider, Spin, Typography } from 'antd'
import dayjs from 'dayjs'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useEffect, useMemo, useState } from 'react'
import Map from 'react-map-gl'

const { Text, Title } = Typography

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const MAP_STYLE = import.meta.env.VITE_MAPBOX_STYLE

interface PredictiveMapProps {
  segmentData?: SegmentResponse | null
  trafficStatus?: TrafficStatus[]
  style?: React.CSSProperties
}

export const PredictiveMap: React.FC<PredictiveMapProps> = ({
  segmentData: propSegmentData,
  trafficStatus: propTrafficStatus,
  style,
}) => {
  // Sử dụng dữ liệu từ props hoặc fallback về global hooks (tự động check IndexedDB cache)
  const hookSegments = useSegments()
  const hookStatus = useTrafficStatus()

  const segmentData = propSegmentData !== undefined ? propSegmentData : hookSegments
  const trafficStatus = propTrafficStatus !== undefined ? propTrafficStatus : hookStatus

  const [timeMode, setTimeMode] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [predictionData, setPredictionData] = useState<PredictionItem[]>([])
  const [hoverInfo, setHoverInfo] = useState<any>(null)

  // Gọi API lấy prediction data khi gạt slider sang chế độ Forecast (+15 Phút)
  useEffect(() => {
    let isMounted = true

    const fetchPredictions = async () => {
      // Chỉ fetch nếu đang ở mode 1 và có data trafficStatus
      if (timeMode === 1 && trafficStatus && trafficStatus.length > 0) {
        // Tránh fetch lại lần nữa nếu đã có data
        if (predictionData.length > 0) return

        setLoading(true)
        try {
          const segmentIds = trafficStatus.map((s) => s.segmentId)
          const response = await predictionApi.getBatchPrediction({
            segment_ids: segmentIds,
            request_time: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
            prediction_horizon_minutes: 15,
          })

          if (isMounted && response.success && response.data) {
            setPredictionData(response.data.items)
          }
        } catch (error) {
          console.error('Failed to fetch prediction batch', error)
        } finally {
          if (isMounted) setLoading(false)
        }
      }
    }

    fetchPredictions()

    return () => {
      isMounted = false
    }
  }, [timeMode, trafficStatus, predictionData.length])

  // Gộp data từ traffic Status / prediction API vào GeoJSON Features
  const combinedGeoJson = useMemo(() => {
    if (!segmentData) return null

    const features = segmentData.features.map((f: GeoJSONFeature) => {
      const segId = f.properties.segmentId
      const currentStatus = trafficStatus?.find((t) => t.segmentId === segId)
      const predStatus = predictionData.find((p) => p.segment_id === segId)

      let level = 1 // Mặc định xanh lá
      let usedFallback = false
      let showDesc = 'Không có dữ liệu'

      if (timeMode === 0) {
        // Mode Hiện tại (Real-time)
        if (currentStatus) {
          // Ánh xạ losScore (có thể từ 1 tới 6) sang congestion_level 1 -> 5
          const score = currentStatus.losScore || 1
          level = score > 5 ? 5 : score
          showDesc = `LOS ${currentStatus.losGrade} - Tốc độ: ${Math.round(
            currentStatus.currentSpeed
          )} km/h`
        }
      } else {
        // Mode Dự báo +15 Phút
        if (predStatus) {
          level = predStatus.congestion_level
          usedFallback = predStatus.used_fallback
          showDesc = predStatus.status_description
        } else if (currentStatus) {
          // Fallback nếu không có prediction trả về nhưng có status hiện tại
          const score = currentStatus.losScore || 1
          level = score > 5 ? 5 : score
          showDesc = `Dữ liệu hiện tại (Chưa có dự báo)`
        }
      }

      return {
        ...f,
        properties: {
          ...f.properties,
          displayLevel: level,
          usedFallback,
          displayDesc: showDesc,
        },
      }
    })

    return { type: 'FeatureCollection', features }
  }, [segmentData, trafficStatus, predictionData, timeMode])

  // Hàm thiết lập màu dựa trên Level
  const getLineColor = (f: any): [number, number, number] => {
    const level = f.properties.displayLevel
    if (level === 1) return [34, 197, 94] // Xanh lá
    if (level === 2) return [234, 179, 8] // Vàng
    if (level === 3) return [249, 115, 22] // Cam
    if (level >= 4) return [239, 68, 68] // Đỏ
    return [156, 163, 175] // Xám
  }

  // Khai báo Layer với Deck.gl
  const layers = useMemo(() => {
    if (!combinedGeoJson) return []

    return [
      new GeoJsonLayer({
        id: 'predictive-traffic-lines',
        data: combinedGeoJson as any,
        pickable: true,
        stroked: false,
        filled: false,
        lineWidthScale: 1,
        lineWidthMinPixels: 2,
        lineWidthMaxPixels: 10,
        getLineColor,
        getLineWidth: 4,
        
        // Cấu hình PathStyleExtension nâng cao của Deck.gl
        // Để vẽ Nét đứt (Dash) ta cần sử dụng Extension này. Thuộc tính dash_array sẽ chứa mảng kích thước [dashLength, gapLength]
        getDashArray: (f: any) =>
          f.properties.usedFallback ? [4, 2] : [0, 0],
        dashJustified: true,
        extensions: [new PathStyleExtension({ dash: true })],
        
        onHover: (info: any) => setHoverInfo(info),
        updateTriggers: {
          getLineColor: [timeMode],
          getDashArray: [timeMode],
        },
      }),
    ]
  }, [combinedGeoJson, timeMode])

  const renderTooltip = () => {
    if (!hoverInfo || !hoverInfo.object) return null

    const { properties } = hoverInfo.object
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
          minWidth: '220px',
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px', color: '#1f2937' }}>
          {properties.segmentName}
        </div>
        <div style={{ fontSize: '13px', color: '#4b5563', marginBottom: '4px' }}>
          Mức độ kẹt xe: <span style={{ fontWeight: 'bold' }}>{properties.displayLevel}</span>
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          {properties.displayDesc}
        </div>
        
        {properties.usedFallback && (
          <div style={{ 
            marginTop: '8px', 
            fontSize: '12px', 
            color: '#ef4444', 
            fontWeight: '500',
            backgroundColor: '#fee2e2',
            padding: '4px 8px',
            borderRadius: '4px'
          }}>
            ⚠️ Dữ liệu nội suy từ đoạn đường lân cận
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <DeckGL
        initialViewState={{
          longitude: DEFAULT_MAP_CENTER[0],
          latitude: DEFAULT_MAP_CENTER[1],
          zoom: DEFAULT_MAP_ZOOM,
          pitch: 45,
          bearing: 0,
        }}
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

      {/* Control Panel: Antd Card Floating Bottom Center */}
      <Card
        size="small"
        style={{
          position: 'absolute',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '320px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          borderRadius: '12px',
          zIndex: 10,
        }}
        bodyStyle={{ padding: '16px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={5} style={{ margin: 0 }}>
              Dự báo Giao thông Động
            </Title>
            {loading && <Spin size="small" />}
          </div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Điều chỉnh thanh trượt để xem mốc thời gian ước tính kẹt xe
          </Text>
          <Slider
            min={0}
            max={1}
            marks={{
              0: 'Hiện tại',
              1: '+15 Phút',
            }}
            step={null} // Chỉ cho phép chọn 0 hoặc 1
            value={timeMode}
            onChange={(val) => setTimeMode(val)}
            tooltip={{ formatter: null }} // Tắt popup mặc định của slider
          />
        </div>
      </Card>
    </div>
  )
}
