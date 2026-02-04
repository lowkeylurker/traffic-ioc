// Map Controls Component

import React, { useState } from 'react'
import { Button, Tooltip, Space } from 'antd'
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  CompassOutlined,
  CameraOutlined,
  BgColorsOutlined,
} from '@ant-design/icons'

interface MapControlsProps {
  onZoomIn?: () => void
  onZoomOut?: () => void
  onCompass?: () => void
  onCamera?: () => void
  onHeatmapToggle?: (enabled: boolean) => void
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onCompass,
  onCamera,
  onHeatmapToggle,
}) => {
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)

  const handleHeatmapToggle = () => {
    setHeatmapEnabled(!heatmapEnabled)
    onHeatmapToggle?.(!heatmapEnabled)
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
          borderRadius: 12,
          padding: '12px',
          boxShadow:
            '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
        }}
      >
        <Space direction="vertical" size={4}>
          <Tooltip title="Phóng to">
            <Button
              type="text"
              size="large"
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
              size="large"
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
              margin: '4px 0',
            }}
          />

          <Tooltip title="Đặt lại hướng">
            <Button
              type="text"
              size="large"
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
              size="large"
              icon={
                <CameraOutlined style={{ fontSize: 18, color: '#722ed1' }} />
              }
              onClick={onCamera}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>

          <Tooltip
            title={heatmapEnabled ? 'Tắt bản đồ nhiệt' : 'Bật bản đồ nhiệt'}
          >
            <Button
              type={heatmapEnabled ? 'primary' : 'text'}
              size="large"
              icon={<BgColorsOutlined style={{ fontSize: 18 }} />}
              onClick={handleHeatmapToggle}
              style={{ width: '100%', textAlign: 'center' }}
            />
          </Tooltip>
        </Space>
      </div>
    </div>
  )
}
