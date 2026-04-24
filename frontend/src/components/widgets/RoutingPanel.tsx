// Routing Panel
import { PlaceSearchResult } from '@/types'
import {
  ColumnHeightOutlined,
  FieldTimeOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  InfoCircleOutlined,
  NodeIndexOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { Button, Card, Divider, Grid, Space, Tag, Typography } from 'antd'
import React, { useEffect } from 'react'
import { RoutingPlaceAutoComplete } from './RoutingPlaceAutoComplete'

const { Text, Title } = Typography
const { useBreakpoint } = Grid

interface RoutingPanelProps {
  visible: boolean
  isEditingRoutePoints: boolean
  startPoint: string
  endPoint: string
  loading: boolean
  activeInput: 'start' | 'end'
  routeGeoJSON?: any
  onStartChange: (val: string) => void
  onEndChange: (val: string) => void
  onStartPlaceSelect: (place: PlaceSearchResult) => void
  onEndPlaceSelect: (place: PlaceSearchResult) => void
  onActiveInputSet: (type: 'start' | 'end') => void
  onComputeRoute: () => void
  onGetCurrentLocation: (target: 'start' | 'end') => void
  onEditingRoutePointsChange: (isEditing: boolean) => void
  onClose: () => void
  onSwap: () => void
}

export const RoutingPanel: React.FC<RoutingPanelProps> = ({
  visible,
  isEditingRoutePoints,
  startPoint,
  endPoint,
  loading,
  activeInput,
  routeGeoJSON,
  onStartChange,
  onEndChange,
  onStartPlaceSelect,
  onEndPlaceSelect,
  onActiveInputSet,
  onComputeRoute,
  onGetCurrentLocation,
  onEditingRoutePointsChange,
  onClose,
  onSwap,
}) => {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const mobileBaseFontSize = 14
  const [isCompactMode, setIsCompactMode] = React.useState(isMobile)
  const hasRouteResult = Boolean(routeGeoJSON?.features?.[0]?.properties)
  const hideInputsAfterRouteFound = hasRouteResult && !isEditingRoutePoints
  const hideHeaderInCompact = isCompactMode
  const showCompactMiniHeader = isCompactMode && hasRouteResult
  const showRouteSummary =
    hasRouteResult && !isCompactMode && hideInputsAfterRouteFound

  useEffect(() => {
    setIsCompactMode(isMobile)
  }, [isMobile])

  useEffect(() => {
    if (isMobile && hasRouteResult) {
      setIsCompactMode(true)
    }
  }, [hasRouteResult, isMobile])

  useEffect(() => {
    if (hasRouteResult) {
      onEditingRoutePointsChange(false)
      return
    }

    onEditingRoutePointsChange(true)
  }, [hasRouteResult, onEditingRoutePointsChange])

  if (!visible) return null

  return (
    <Card
      style={{
        position: 'absolute',
        top: isMobile ? 12 : 24,
        left: isMobile ? '50%' : 24,
        right: 'auto',
        bottom: 'auto',
        transform: isMobile ? 'translateX(-50%)' : 'none',
        width: isMobile
          ? hideInputsAfterRouteFound
            ? 'min(84vw, 300px)'
            : 'min(92vw, 336px)'
          : 340,
        maxWidth: isMobile ? 'none' : 380,
        maxHeight: isMobile
          ? hideInputsAfterRouteFound
            ? '38vh'
            : '52vh'
          : '72vh',
        overflow: 'hidden',
        zIndex: 20,
        borderRadius: isMobile ? 12 : 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        transition:
          'width 220ms ease, max-height 220ms ease, transform 220ms ease, top 220ms ease, left 220ms ease',
      }}
      bodyStyle={{
        padding:
          isMobile && hideInputsAfterRouteFound
            ? '8px 9px'
            : isMobile
              ? '9px 10px'
              : '16px',
        maxHeight: isMobile
          ? hideInputsAfterRouteFound
            ? '38vh'
            : '52vh'
          : '72vh',
        overflowY: 'auto',
        fontSize: isMobile ? mobileBaseFontSize : 14,
        transition: 'padding 220ms ease, max-height 220ms ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? (hideInputsAfterRouteFound ? '6px' : '8px') : '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '6px' : '8px',
            justifyContent: 'space-between',
          }}
        >
          {!hideHeaderInCompact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  background: '#0e7490',
                  padding: isMobile ? '5px' : '6px',
                  borderRadius: '6px',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <NodeIndexOutlined />
              </div>
              <div>
                <Title
                  level={5}
                  style={{
                    margin: 0,
                    color: '#1f2937',
                    fontSize: isMobile ? 14 : undefined,
                  }}
                >
                  Dẫn đường thông minh
                </Title>
                <Text
                  type="secondary"
                  style={{
                    fontSize: isMobile ? `${mobileBaseFontSize}px` : '12px',
                  }}
                >
                  Tránh điểm kẹt xe, sự cố
                </Text>
              </div>
            </div>
          )}

          {showCompactMiniHeader && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#334155',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              Kết quả lộ trình
            </div>
          )}

          <Space size={4}>
            {routeGeoJSON?.features?.[0]?.properties && (
              <Button
                type="text"
                size="small"
                onClick={() => setIsCompactMode((prev) => !prev)}
                icon={
                  isCompactMode ? (
                    <FullscreenOutlined />
                  ) : (
                    <FullscreenExitOutlined />
                  )
                }
                title={isCompactMode ? 'Hiển thị đầy đủ' : 'Thu gọn'}
                aria-label={isCompactMode ? 'Hiển thị đầy đủ' : 'Thu gọn'}
                style={{
                  color: '#0e7490',
                  fontSize: isMobile ? 13 : 14,
                  minWidth: 32,
                  minHeight: 32,
                }}
              />
            )}
          </Space>
        </div>

        {showRouteSummary && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <Text style={{ fontSize: isMobile ? 12 : 12, color: '#64748b' }}>
              Lộ trình
            </Text>
            <Text style={{ fontSize: isMobile ? 13 : 13, color: '#0f172a' }}>
              <strong>Từ:</strong> {startPoint || 'Chưa chọn'}
            </Text>
            <Text style={{ fontSize: isMobile ? 13 : 13, color: '#0f172a' }}>
              <strong>Đến:</strong> {endPoint || 'Chưa chọn'}
            </Text>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, alignSelf: 'flex-start', height: 'auto' }}
              onClick={() => onEditingRoutePointsChange(true)}
            >
              Tùy chỉnh địa điểm
            </Button>
          </div>
        )}

        {!hideInputsAfterRouteFound && (
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: isMobile ? '6px' : '8px',
              marginTop: isMobile ? 4 : 8,
            }}
          >
            {/* Track line visual */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '10px 0',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  border: '2px solid #3b82f6',
                }}
              />
              <div
                style={{
                  width: 2,
                  height: '36px',
                  background: '#e5e7eb',
                  flex: 1,
                  margin: '4px 0',
                }}
              />
              <div style={{ width: 8, height: 8, background: '#ef4444' }} />
            </div>

            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: isMobile ? '10px' : '16px',
                padding: isMobile ? '2px 0' : '4px 0',
              }}
            >
              <RoutingPlaceAutoComplete
                value={startPoint}
                onChange={onStartChange}
                onFocus={() => onActiveInputSet('start')}
                onSelectPlace={onStartPlaceSelect}
                onUseCurrentLocation={() => onGetCurrentLocation('start')}
                active={activeInput === 'start'}
                pinColor="#3b82f6"
                placeholder="Tìm điểm đi (địa danh, địa chỉ...)"
              />
              <RoutingPlaceAutoComplete
                value={endPoint}
                onChange={onEndChange}
                onFocus={() => onActiveInputSet('end')}
                onSelectPlace={onEndPlaceSelect}
                onUseCurrentLocation={() => onGetCurrentLocation('end')}
                active={activeInput === 'end'}
                pinColor="#ef4444"
                placeholder="Tìm điểm đến (địa danh, địa chỉ...)"
              />
            </div>

            {/* Swap button */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Button
                type="text"
                icon={<SwapOutlined rotate={90} />}
                onClick={onSwap}
                style={{ color: '#6b7280', minHeight: 36, minWidth: 36 }}
              />
            </div>
          </div>
        )}

        {!hideInputsAfterRouteFound && (
          <Button
            type="primary"
            block
            size="middle"
            onClick={onComputeRoute}
            loading={loading}
            disabled={!startPoint || !endPoint}
            style={{
              background: '#0e7490',
              borderColor: '#0e7490',
              borderRadius: 8,
              fontWeight: 600,
              marginTop: 4,
              minHeight: isMobile ? 36 : 40,
              fontSize: isMobile ? mobileBaseFontSize : 14,
            }}
          >
            {hasRouteResult ? 'Cập nhật lộ trình' : 'Bắt đầu chỉ đường'}
          </Button>
        )}

        {hasRouteResult && (
          <>
            {!hideInputsAfterRouteFound && (
              <Divider style={{ margin: isMobile ? '8px 0' : '12px 0' }} />
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: isMobile ? '8px' : '10px',
              }}
            >
              {(() => {
                const props = routeGeoJSON.features[0].properties
                const sec = props.totalTimeSec || 0
                const mins = Math.ceil(sec / 60)
                const durationText =
                  mins >= 60
                    ? `${Math.floor(mins / 60)}h ${mins % 60}m`
                    : `${mins}m`
                const durationTextCompact = `${mins}m`
                const distanceText = `${(props.totalDistanceM / 1000).toFixed(1)}km`

                if (isCompactMode) {
                  return (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          background: '#f8fbff',
                          border: '1px solid #dbeafe',
                          borderRadius: 8,
                          padding: '9px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 7,
                        }}
                      >
                        <FieldTimeOutlined
                          style={{ color: '#0369a1', fontSize: 13 }}
                        />
                        <Text
                          strong
                          style={{
                            fontSize: isMobile ? mobileBaseFontSize : 16,
                            color: '#0f172a',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {durationTextCompact}
                        </Text>
                      </div>
                      <div
                        style={{
                          background: '#f7fdf8',
                          border: '1px solid #dcfce7',
                          borderRadius: 8,
                          padding: '9px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 7,
                        }}
                      >
                        <ColumnHeightOutlined
                          style={{ color: '#15803d', fontSize: 13 }}
                        />
                        <Text
                          strong
                          style={{
                            fontSize: isMobile ? mobileBaseFontSize : 16,
                            color: '#0f172a',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {distanceText}
                        </Text>
                      </div>
                    </div>
                  )
                }

                return (
                  <>
                    <Space direction="vertical" size={2}>
                      <Text
                        type="secondary"
                        style={{
                          fontSize: isMobile
                            ? `${mobileBaseFontSize}px`
                            : '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Kết quả tìm đường
                      </Text>
                    </Space>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          background: '#f0f9ff',
                          borderRadius: 8,
                          padding: isMobile ? '8px 9px' : '10px',
                          border: '1px solid #dbeafe',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            background: '#e0f2fe',
                            padding: isMobile ? '5px' : '6px',
                            borderRadius: 8,
                            color: '#0369a1',
                          }}
                        >
                          <FieldTimeOutlined
                            style={{ fontSize: isMobile ? '14px' : '16px' }}
                          />
                        </div>
                        <div style={{ lineHeight: 1.2 }}>
                          <Text
                            strong
                            style={{
                              fontSize: isMobile
                                ? `${mobileBaseFontSize}px`
                                : '16px',
                              display: 'block',
                            }}
                          >
                            {mins >= 60
                              ? `${Math.floor(mins / 60)} giờ ${mins % 60} phút`
                              : `${mins} phút`}
                          </Text>
                          <Text
                            type="secondary"
                            style={{ fontSize: isMobile ? '12px' : '12px' }}
                          >
                            Thời gian dự kiến
                          </Text>
                        </div>
                      </div>

                      <div
                        style={{
                          background: '#f0fdf4',
                          borderRadius: 8,
                          padding: isMobile ? '8px 9px' : '10px',
                          border: '1px solid #dcfce7',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            background: '#dcfce7',
                            padding: isMobile ? '5px' : '6px',
                            borderRadius: 8,
                            color: '#15803d',
                          }}
                        >
                          <ColumnHeightOutlined
                            style={{ fontSize: isMobile ? '14px' : '16px' }}
                          />
                        </div>
                        <div style={{ lineHeight: 1.2 }}>
                          <Text
                            strong
                            style={{
                              fontSize: isMobile
                                ? `${mobileBaseFontSize}px`
                                : '16px',
                              display: 'block',
                            }}
                          >
                            {(props.totalDistanceM / 1000).toFixed(1)} km
                          </Text>
                          <Text
                            type="secondary"
                            style={{ fontSize: isMobile ? '12px' : '12px' }}
                          >
                            Quãng đường
                          </Text>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#f8fafc',
                        padding: isMobile ? '8px' : '10px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <InfoCircleOutlined style={{ color: '#64748b' }} />
                      <Text
                        style={{
                          fontSize: isMobile
                            ? `${mobileBaseFontSize}px`
                            : '13px',
                        }}
                      >
                        Trạng thái:{' '}
                        {(() => {
                          const avgSpeedKmh =
                            props.totalDistanceM /
                            1000 /
                            (props.totalTimeSec / 3600)
                          if (avgSpeedKmh < 15)
                            return (
                              <Tag color="error" style={{ border: 'none' }}>
                                Ùn tắc nặng
                              </Tag>
                            )
                          if (avgSpeedKmh < 25)
                            return (
                              <Tag color="warning" style={{ border: 'none' }}>
                                Di chuyển chậm
                              </Tag>
                            )
                          return (
                            <Tag color="success" style={{ border: 'none' }}>
                              Thông thoáng
                            </Tag>
                          )
                        })()}
                      </Text>
                    </div>
                  </>
                )
              })()}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
