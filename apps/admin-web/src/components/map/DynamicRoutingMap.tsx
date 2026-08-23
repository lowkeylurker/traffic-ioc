import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/config/constants'
import { simulationApi } from '@/services/api'
import { PathLayer } from '@deck.gl/layers'
import DeckGL from '@deck.gl/react'
import { Button, Card, Col, Input, Row, Spin, Typography, message } from 'antd'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useMemo, useState } from 'react'
import Map from 'react-map-gl'

const { Title, Text } = Typography

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const MAP_STYLE = import.meta.env.VITE_MAPBOX_STYLE

interface DynamicRoutingMapProps {
  style?: React.CSSProperties
}

export const DynamicRoutingMap: React.FC<DynamicRoutingMapProps> = ({ style }) => {
  // Toạ độ test mẫu
  const [startPoint, setStartPoint] = useState<string>('10.7769, 106.7009') // Q1
  const [endPoint, setEndPoint] = useState<string>('10.81, 106.715') // Bình Thạnh
  
  const [loading, setLoading] = useState<boolean>(false)
  const [routeData, setRouteData] = useState<any>(null)

  const handleComputeRoute = async () => {
    try {
      const [startLat, startLng] = startPoint.split(',').map((s) => parseFloat(s.trim()))
      const [endLat, endLng] = endPoint.split(',').map((s) => parseFloat(s.trim()))

      if (!startLat || !startLng || !endLat || !endLng) {
        message.warning('Vui lòng nhập toạ độ hợp lệ (Lat, Lng)')
        return
      }

      setLoading(true)
      const response = await simulationApi.getDynamicRoute(startLat, startLng, endLat, endLng)

      if (response.success && response.data) {
        setRouteData(response.data)
        message.success('Tìm đường thành công')
      } else {
        message.error('Không tìm thấy đường đi')
      }
    } catch (error: any) {
      console.error('Routing Error:', error)
      message.error(error.message || 'Có lỗi xảy ra khi gọi thuật toán tìm đường')
    } finally {
      setLoading(false)
    }
  }

  // Khai báo layer để vẽ đường đi siêu sáng
  const layers = useMemo(() => {
    if (!routeData) return []

    return [
      new PathLayer({
        id: 'dynamic-routing-layer',
        data: routeData.features,
        pickable: true,
        widthScale: 1,
        widthMinPixels: 4,
        widthMaxPixels: 10,
        // Vẽ tia sáng màu Cyan (Xanh mỏ két phát sáng)
        getColor: [0, 255, 255, 200],
        getPath: (d: any) => d.geometry.coordinates,
        getWidth: 8,
        // Style glow
        parameters: {
          blendFunc: ['SRC_ALPHA', 'ONE', 'ONE_MINUS_DST_ALPHA', 'ONE'],
          blendEquation: ['FUNC_ADD', 'FUNC_ADD'],
        },
      }),
    ]
  }, [routeData])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <DeckGL
        initialViewState={{
          longitude: DEFAULT_MAP_CENTER[0],
          latitude: DEFAULT_MAP_CENTER[1],
          zoom: DEFAULT_MAP_ZOOM + 1,
          pitch: 50,
          bearing: 15,
        }}
        controller={true}
        layers={layers}
      >
        <Map mapStyle={MAP_STYLE} mapboxAccessToken={MAPBOX_TOKEN} reuseMaps />
      </DeckGL>

      {/* Control Panel: Float Top Left */}
      <Card
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          width: '380px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          borderRadius: '12px',
          zIndex: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
        }}
        bodyStyle={{ padding: '20px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <Title level={4} style={{ margin: 0, color: '#1f2937' }}>
              Dẫn đường Động (pgRouting)
            </Title>
            <Text type="secondary" style={{ fontSize: '13px' }}>
              Thuật toán Dijkstra ưu tiên chi phí theo TTI
            </Text>
          </div>

          <Row gutter={[12, 12]}>
            <Col span={24}>
              <Text strong style={{ fontSize: '12px', color: '#4b5563' }}>Điểm xuất phát (Lat, Lng):</Text>
              <Input 
                value={startPoint} 
                onChange={(e) => setStartPoint(e.target.value)} 
                placeholder="10.7769, 106.7009"
              />
            </Col>
            <Col span={24}>
              <Text strong style={{ fontSize: '12px', color: '#4b5563' }}>Điểm kết thúc (Lat, Lng):</Text>
              <Input 
                value={endPoint} 
                onChange={(e) => setEndPoint(e.target.value)} 
                placeholder="10.81, 106.715"
              />
            </Col>
            <Col span={24} style={{ marginTop: '8px' }}>
              <Button 
                type="primary" 
                block 
                size="large" 
                onClick={handleComputeRoute}
                disabled={loading}
                style={{ background: '#0e7490', borderColor: '#0e7490', fontWeight: 'bold' }}
              >
                {loading ? <Spin size="small" /> : 'Tìm đường đi nhanh nhất'}
              </Button>
            </Col>
          </Row>
        </div>
      </Card>
    </div>
  )
}
