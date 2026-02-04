// Top KPI Bar Component

import React from 'react'
import { Row, Col } from 'antd'

import { MOCK_ALERTS, MOCK_WEATHER } from '@/config/constants'

interface KPIBarProps {
  avgSpeed?: number
  activeJams?: number
  incidentCount?: number
}

export const KPIBar: React.FC<KPIBarProps> = ({
  avgSpeed = 28,
  activeJams = 5,
  incidentCount = MOCK_ALERTS.length,
}) => {
  const weather = MOCK_WEATHER

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        right: 310,
        zIndex: 20,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 12,
        padding: '16px',
        boxShadow:
          '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        transition: 'all 0.3s ease',
      }}
    >
      <Row gutter={[24, 0]} align="middle">
        <Col xs={12} sm={6}>
          <div
            style={{
              textAlign: 'center',
              padding: '12px',
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

        <Col xs={12} sm={6}>
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

        <Col xs={12} sm={6}>
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

        <Col xs={12} sm={6}>
          <div
            style={{
              textAlign: 'center',
              padding: '12px',
              background: '#e6f7ff',
              borderRadius: 8,
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#bae7ff'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#e6f7ff'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: '#0050b3',
                fontWeight: 600,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              🌦️ Thời Tiết
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>
              {weather.temperature}°C
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'rgba(0, 0, 0, 0.45)',
                marginTop: 4,
              }}
            >
              {weather.condition}
            </div>
          </div>
        </Col>
      </Row>
    </div>
  )
}
