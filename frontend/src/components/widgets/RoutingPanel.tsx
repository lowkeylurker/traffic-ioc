// Routing Panel
import { 
  NodeIndexOutlined, 
  SwapOutlined, 
  FieldTimeOutlined, 
  ColumnHeightOutlined, 
  InfoCircleOutlined,
  AimOutlined,
  EnvironmentOutlined
} from '@ant-design/icons'
import { Button, Card, Input, Typography, Divider, Space, Tag, Tooltip } from 'antd'
import React from 'react'

const { Text, Title } = Typography

interface RoutingPanelProps {
  visible: boolean
  startPoint: string
  endPoint: string
  loading: boolean
  activeInput: 'start' | 'end'
  routeGeoJSON?: any 
  onStartChange: (val: string) => void
  onEndChange: (val: string) => void
  onActiveInputSet: (type: 'start' | 'end') => void
  onComputeRoute: () => void
  onGetCurrentLocation: () => void
  onClose: () => void
  onSwap: () => void
}

export const RoutingPanel: React.FC<RoutingPanelProps> = ({
  visible,
  startPoint,
  endPoint,
  loading,
  activeInput,
  routeGeoJSON,
  onStartChange,
  onEndChange,
  onActiveInputSet,
  onComputeRoute,
  onGetCurrentLocation,
  onSwap,
}) => {
  if (!visible) return null

  return (
    <Card
      style={{
        position: 'absolute',
        top: 24,
        left: 24,
        width: 340,
        zIndex: 20,
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
      }}
      bodyStyle={{ padding: '16px' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              background: '#0e7490',
              padding: '6px',
              borderRadius: '6px',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <NodeIndexOutlined />
          </div>
          <div>
            <Title level={5} style={{ margin: 0, color: '#1f2937' }}>
              Dẫn đường thông minh
            </Title>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Tránh điểm kẹt xe, sự cố
            </Text>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px', marginTop: 8 }}>
          {/* Track line visual */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid #3b82f6' }} />
            <div style={{ width: 2, height: '36px', background: '#e5e7eb', flex: 1, margin: '4px 0' }} />
            <div style={{ width: 8, height: 8, background: '#ef4444' }} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Input
              value={startPoint}
              onChange={(e) => onStartChange(e.target.value)}
              onFocus={() => onActiveInputSet('start')}
              placeholder="Vị trí bắt đầu (click map...)"
              variant="filled"
              prefix={<EnvironmentOutlined style={{ color: '#3b82f6' }} />}
              suffix={
                <Tooltip title="Lấy vị trí hiện tại của tôi">
                  <Button 
                    type="text" 
                    size="small" 
                    icon={<AimOutlined />} 
                    onClick={(e) => {
                      e.stopPropagation();
                      onGetCurrentLocation();
                    }}
                    style={{ color: '#0e7490' }}
                  />
                </Tooltip>
              }
              style={{ 
                padding: '8px 12px',
                border: activeInput === 'start' ? '1px solid #3b82f6' : '1px solid transparent',
                transition: 'all 0.3s'
              }}
            />
            <Input
              value={endPoint}
              onChange={(e) => onEndChange(e.target.value)}
              onFocus={() => onActiveInputSet('end')}
              placeholder="Vị trí đến (click map...)"
              variant="filled"
              prefix={<EnvironmentOutlined style={{ color: '#ef4444' }} />}
              status={!endPoint ? 'warning' : ''}
              style={{ 
                padding: '8px 12px',
                border: activeInput === 'end' ? '1px solid #ef4444' : '1px solid transparent',
                transition: 'all 0.3s'
              }}
            />
          </div>

          {/* Swap button */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button 
               type="text" 
               icon={<SwapOutlined rotate={90} />} 
               onClick={onSwap}
               style={{ color: '#6b7280' }}
            />
          </div>
        </div>

        <Button
          type="primary"
          block
          size="middle"
          onClick={onComputeRoute}
          loading={loading}
          disabled={!startPoint || !endPoint}
          style={{ background: '#0e7490', borderColor: '#0e7490', borderRadius: 8, fontWeight: 600, marginTop: 4 }}
        >
          Bắt đầu chỉ đường
        </Button>

        {routeGeoJSON?.features?.[0]?.properties && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Space direction="vertical" size={2}>
                <Text type="secondary" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Kết quả tìm đường
                </Text>
              </Space>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={12}>
                  <div style={{ background: '#f0f9ff', padding: '8px', borderRadius: '8px', color: '#0369a1' }}>
                    <FieldTimeOutlined style={{ fontSize: '18px' }} />
                  </div>
                  <div>
                    <Text strong style={{ fontSize: '16px', display: 'block' }}>
                      {(() => {
                        const sec = routeGeoJSON.features[0].properties.totalTimeSec || 0
                        const mins = Math.ceil(sec / 60)
                        return mins >= 60 
                          ? `${Math.floor(mins / 60)} giờ ${mins % 60} phút` 
                          : `${mins} phút`
                      })()}
                    </Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>Thời gian dự kiến</Text>
                  </div>
                </Space>

                <Space size={12} style={{ textAlign: 'right' }}>
                  <div style={{ textAlign: 'right' }}>
                    <Text strong style={{ fontSize: '16px', display: 'block' }}>
                      {(routeGeoJSON.features[0].properties.totalDistanceM / 1000).toFixed(1)} km
                    </Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>Quãng đường</Text>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '8px', borderRadius: '8px', color: '#15803d' }}>
                    <ColumnHeightOutlined style={{ fontSize: '18px' }} />
                  </div>
                </Space>
              </div>

              <div 
                style={{ 
                  background: '#f8fafc', 
                  padding: '10px', 
                  borderRadius: '8px', 
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <InfoCircleOutlined style={{ color: '#64748b' }} />
                <Text style={{ fontSize: '13px' }}>
                  Trạng thái: {' '}
                  {(() => {
                    const props = routeGeoJSON.features[0].properties
                    const avgSpeedKmh = (props.totalDistanceM / 1000) / (props.totalTimeSec / 3600)
                    if (avgSpeedKmh < 15) return <Tag color="error" style={{ border: 'none' }}>Ùn tắc nặng</Tag>
                    if (avgSpeedKmh < 25) return <Tag color="warning" style={{ border: 'none' }}>Di chuyển chậm</Tag>
                    return <Tag color="success" style={{ border: 'none' }}>Thông thoáng</Tag>
                  })()}
                </Text>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
