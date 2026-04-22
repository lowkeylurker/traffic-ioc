// Map Controls Component

import {
  AlertOutlined,
  CameraOutlined,
  CloudOutlined,
  CompassOutlined,
  LineChartOutlined,
  NodeIndexOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { Button, Space, Tooltip } from 'antd'
import React, { useState } from 'react'

interface MapControlsProps {
  onZoomIn?: () => void
  onZoomOut?: () => void
  onCompass?: () => void
  onCamera?: () => void
  onSegmentStatusToggle?: (enabled: boolean) => void
  onWeatherToggle?: (enabled: boolean) => void
  onIncidentToggle?: (enabled: boolean) => void
  onRoutingToggle?: (enabled: boolean) => void
  showCamera?: boolean
  showRouting?: boolean

  defaultSegmentStatusLayerEnabled?: boolean
  defaultWeatherLayerEnabled?: boolean
  defaultIncidentLayerEnabled?: boolean
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onCompass,
  onCamera,
  onSegmentStatusToggle,
  onWeatherToggle,
  onIncidentToggle,
  onRoutingToggle,
  showCamera = true,
  showRouting = true,

  defaultSegmentStatusLayerEnabled = true,
  defaultWeatherLayerEnabled = false,
  defaultIncidentLayerEnabled = false,
}) => {
  const [segmentStatusLayerEnabled, setSegmentStatusLayerEnabled] = useState(
    defaultSegmentStatusLayerEnabled
  )
  const [weatherLayerEnabled, setWeatherLayerEnabled] = useState(
    defaultWeatherLayerEnabled
  )
  const [incidentLayerEnabled, setIncidentLayerEnabled] = useState(
    defaultIncidentLayerEnabled
  )

  const [routingLayerEnabled, setRoutingLayerEnabled] = useState(false)

  const handleSegmentStatusToggle = () => {
    setSegmentStatusLayerEnabled(!segmentStatusLayerEnabled)
    onSegmentStatusToggle?.(!segmentStatusLayerEnabled)
  }

  const handleWeatherToggle = () => {
    setWeatherLayerEnabled(!weatherLayerEnabled)
    onWeatherToggle?.(!weatherLayerEnabled)
  }

  const handleIncidentToggle = () => {
    setIncidentLayerEnabled(!incidentLayerEnabled)
    onIncidentToggle?.(!incidentLayerEnabled)
  }

  const handleRoutingToggle = () => {
    setRoutingLayerEnabled(!routingLayerEnabled)
    onRoutingToggle?.(!routingLayerEnabled)
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 10,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: 8,
          padding: '4px',
          boxShadow:
            '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
        }}
      >
        <Space direction="vertical" size={4}>
          <Tooltip title="Phóng to" placement="left">
            <Button
              type="text"
              size="small"
              icon={
                <ZoomInOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              }
              onClick={onZoomIn}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>

          <Tooltip title="Thu nhỏ" placement="left">
            <Button
              type="text"
              size="small"
              icon={
                <ZoomOutOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              }
              onClick={onZoomOut}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>

          <div
            style={{
              borderTop: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          />

          <Tooltip title="Đặt lại hướng" placement="left">
            <Button
              type="text"
              size="small"
              icon={
                <CompassOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              }
              onClick={onCompass}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>

          <Tooltip title="Camera giám sát" placement="left">
            {showCamera && (
              <Button
                type="text"
                size="small"
                icon={
                  <CameraOutlined style={{ fontSize: 18, color: '#722ed1' }} />
                }
                onClick={onCamera}
                style={{ width: '100%', textAlign: 'center' }}
              />
            )}
          </Tooltip>

          {showRouting && (
            <Tooltip
              placement="left"
              title={routingLayerEnabled ? 'Tắt dẫn đường' : 'Bật dẫn đường'}
            >
              <Button
                type={routingLayerEnabled ? 'primary' : 'text'}
                size="small"
                icon={<NodeIndexOutlined style={{ fontSize: 18, color: routingLayerEnabled ? '#fff' : '#0e7490' }} />}
                onClick={handleRoutingToggle}
                style={{ width: '100%', textAlign: 'center' }}
              />
            </Tooltip>
          )}

          <Tooltip
            placement="left"
            title={
              segmentStatusLayerEnabled
                ? 'Tắt lớp trạng thái đoạn đường'
                : 'Bật lớp trạng thái đoạn đường'
            }
          >
            <Button
              type={segmentStatusLayerEnabled ? 'primary' : 'text'}
              size="small"
              icon={<LineChartOutlined style={{ fontSize: 18 }} />}
              onClick={handleSegmentStatusToggle}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>

          <Tooltip
            placement="left"
            title={
              weatherLayerEnabled ? 'Tắt lớp thời tiết' : 'Bật lớp thời tiết'
            }
          >
            <Button
              type={weatherLayerEnabled ? 'primary' : 'text'}
              size="small"
              icon={<CloudOutlined style={{ fontSize: 18 }} />}
              onClick={handleWeatherToggle}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>

          <Tooltip
            placement="left"
            title={incidentLayerEnabled ? 'Tắt lớp sự cố' : 'Bật lớp sự cố'}
          >
            <Button
              type={incidentLayerEnabled ? 'primary' : 'text'}
              size="small"
              icon={<AlertOutlined style={{ fontSize: 18 }} />}
              onClick={handleIncidentToggle}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>
        </Space>
      </div>
    </div>
  )
}
