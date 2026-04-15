// Top KPI Bar Component

import { Col, List, Modal, Row } from 'antd'
import React from 'react'

import { MOCK_ALERTS } from '@/config/constants'
import type { GeoJSONFeature } from '@/types'

interface KPIBarProps {
  avgSpeed?: number
  activeJams?: number
  incidentCount?: number
  jamSegments?: GeoJSONFeature[]
  onSegmentClick?: (segment: GeoJSONFeature) => void
}

export const KPIBar: React.FC<KPIBarProps> = ({
  avgSpeed = 28,
  activeJams = 5,
  incidentCount = MOCK_ALERTS.length,
  jamSegments = [],
  onSegmentClick,
}) => {
  const [collapsed, setCollapsed] = React.useState(true)
  const [jamsModalOpen, setJamsModalOpen] = React.useState(false)

  return (
    <div
      style={{
        position: 'relative',
        width: collapsed ? 72 : 'auto',
        maxWidth: collapsed ? 72 : '100%',
        minWidth: collapsed ? 72 : 300,
        zIndex: 20,
        background: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: 14,
        padding: collapsed ? '8px 20px 8px 8px' : '10px',
        boxShadow:
          '0 12px 32px rgba(15, 23, 42, 0.12), 0 2px 10px rgba(15, 23, 42, 0.06)',
        border: '1px solid rgba(148, 163, 184, 0.24)',
        overflow: 'visible',
        transition: 'width 0.3s ease, padding 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 16,
          padding: 0,
          height: '100%',
          borderTopRightRadius: 14,
          borderBottomRightRadius: 14,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          border: '1px solid rgba(232, 234, 239, 0.95)',
          borderLeft: 'none',
          background:
            'linear-gradient(180deg, rgba(250, 250, 252, 0.98) 0%, rgba(242, 244, 248, 0.98) 100%)',
          color: '#8c8c8c',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '4px 0 12px rgba(15, 23, 42, 0.12)',
          transition:
            'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
          letterSpacing: '-0.5px',
        }}
        aria-label={collapsed ? 'Expand KPI bar' : 'Collapse KPI bar'}
        title={collapsed ? 'Mở rộng' : 'Thu gọn'}
      >
        {collapsed ? '>' : '<'}
      </button>

      <div
        style={{
          opacity: collapsed ? 1 : 0,
          maxHeight: collapsed ? 240 : 0,
          overflow: 'hidden',
          transition: 'opacity 0.2s ease, max-height 0.3s ease',
          pointerEvents: collapsed ? 'auto' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#eff5ff',
            borderRadius: 8,
            padding: '4px 6px',
          }}
          title="Vận tốc trung bình"
        >
          <span style={{ fontSize: 13 }}>🚗</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#1677ff',
              fontFamily: 'Roboto Mono, monospace',
            }}
          >
            {avgSpeed}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fff1f0',
            borderRadius: 8,
            padding: '4px 6px',
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
          title="Điểm tắc nghẽn (click để xem chi tiết)"
          onClick={() => setJamsModalOpen(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#ffe7e6'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#fff1f0'
          }}
        >
          <span style={{ fontSize: 13 }}>🚦</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#cf1322',
              fontFamily: 'Roboto Mono, monospace',
            }}
          >
            {activeJams}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fff7e6',
            borderRadius: 8,
            padding: '4px 6px',
          }}
          title="Số sự cố"
        >
          <span style={{ fontSize: 13 }}>⚠️</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#d48806',
              fontFamily: 'Roboto Mono, monospace',
            }}
          >
            {incidentCount}
          </span>
        </div>
      </div>

      <div
        style={{
          opacity: collapsed ? 0 : 1,
          maxHeight: collapsed ? 0 : 300,
          overflow: 'hidden',
          transition: 'opacity 0.2s ease, max-height 0.3s ease',
          pointerEvents: collapsed ? 'none' : 'auto',
        }}
      >
        <Row gutter={[10, 0]} align="middle">
          <Col xs={12} sm={8} style={{ height: '100%' }}>
            <div
              style={{
                textAlign: 'center',
                padding: '12px',
                height: '100%',
                background: '#f6f8fb',
                borderRadius: 8,
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#eff5ff'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f6f8fb'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(0, 0, 0, 0.45)',
                  fontWeight: 600,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                🚗 Vận tốc TB
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: '#1677ff',
                  fontFamily: 'Roboto Mono, monospace',
                }}
              >
                {avgSpeed}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(0, 0, 0, 0.45)',
                  marginTop: 4,
                }}
              >
                km/h
              </div>
            </div>
          </Col>

          <Col xs={12} sm={8}>
            <div
              style={{
                textAlign: 'center',
                padding: '12px',
                background: '#fff1f0',
                borderRadius: 8,
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffe7e6'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff1f0'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: '#cf1322',
                  fontWeight: 600,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                🚦 Tắc Nghẽn
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: '#cf1322',
                  fontFamily: 'Roboto Mono, monospace',
                }}
              >
                {activeJams}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(0, 0, 0, 0.45)',
                  marginTop: 4,
                }}
              >
                điểm
              </div>
            </div>
          </Col>

          <Col xs={12} sm={8}>
            <div
              style={{
                textAlign: 'center',
                padding: '12px',
                background: '#fff7e6',
                borderRadius: 8,
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ffec99'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff7e6'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: '#d48806',
                  fontWeight: 600,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                ⚠️ Sự Cố
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: '#faad14',
                  fontFamily: 'Roboto Mono, monospace',
                }}
              >
                {incidentCount}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(0, 0, 0, 0.45)',
                  marginTop: 4,
                }}
              >
                sự kiện
              </div>
            </div>
          </Col>
        </Row>
      </div>

      <Modal
        title="Các đoạn ùn tắc & đông xe (LOS E/F)"
        open={jamsModalOpen}
        onCancel={() => setJamsModalOpen(false)}
        footer={null}
        width={400}
        bodyStyle={{ maxHeight: '60vh', overflow: 'auto' }}
      >
        {jamSegments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
            Không có đoạn tắc nghẽn
          </div>
        ) : (
          <List
            dataSource={jamSegments}
            renderItem={(segment) => (
              <List.Item
                key={segment.properties.segmentId}
                style={{
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background 0.2s ease',
                }}
                onClick={() => {
                  onSegmentClick?.(segment)
                  setJamsModalOpen(false)
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f5f5f5'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <List.Item.Meta
                  title={
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>
                      {segment.properties.segmentName}
                    </span>
                  }
                  description={
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      Vận tốc: {segment.properties.avgSpeed} km/h • LOS:{' '}
                      {segment.properties.losIndex}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  )
}
