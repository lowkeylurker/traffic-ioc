// Map Controls Component

import {
  BgColorsOutlined,
  CameraOutlined,
  CloudOutlined,
  CompassOutlined,
  LineChartOutlined,
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
  onHeatmapToggle?: (enabled: boolean) => void
  onWeatherToggle?: (enabled: boolean) => void
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onCompass,
  onCamera,
  onSegmentStatusToggle,
  onHeatmapToggle,
  onWeatherToggle,
}) => {
  const [segmentStatusLayerEnabled, setSegmentStatusLayerEnabled] =
    useState(true)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [weatherLayerEnabled, setWeatherLayerEnabled] = useState(false)

  const handleSegmentStatusToggle = () => {
    setSegmentStatusLayerEnabled(!segmentStatusLayerEnabled)
    onSegmentStatusToggle?.(!segmentStatusLayerEnabled)
  }

  const handleHeatmapToggle = () => {
    setHeatmapEnabled(!heatmapEnabled)
    onHeatmapToggle?.(!heatmapEnabled)
  }

  const handleWeatherToggle = () => {
    setWeatherLayerEnabled(!weatherLayerEnabled)
    onWeatherToggle?.(!weatherLayerEnabled)
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
          <Tooltip title="Phóng to">
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

          <Tooltip title="Thu nhỏ">
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

          <Tooltip title="Đặt lại hướng">
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

          <Tooltip title="Camera giám sát">
            <Button
              type="text"
              size="small"
              icon={
                <CameraOutlined style={{ fontSize: 18, color: '#722ed1' }} />
              }
              onClick={onCamera}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>

          <Tooltip
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
            title={heatmapEnabled ? 'Tắt bản đồ nhiệt' : 'Bật bản đồ nhiệt'}
          >
            <Button
              type={heatmapEnabled ? 'primary' : 'text'}
              size="small"
              icon={<BgColorsOutlined style={{ fontSize: 18 }} />}
              onClick={handleHeatmapToggle}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>

          <Tooltip
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
        </Space>
      </div>
    </div>
  )
}
