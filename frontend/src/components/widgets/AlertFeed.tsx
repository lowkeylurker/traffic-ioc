// Alert Feed Widget

import { MOCK_ALERTS } from '@/config/constants'
import { Alert } from '@/types'
import { formatRelativeTime, getSeverityColor } from '@/utils/format'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Empty, List, Tag } from 'antd'
import React from 'react'

interface AlertFeedProps {
  alerts?: Alert[]
  maxHeight?: number
  style?: React.CSSProperties
  onAlertClick?: (alert: Alert) => void
}

export const AlertFeed: React.FC<AlertFeedProps> = ({
  alerts = MOCK_ALERTS,
  maxHeight = 300,
  style,
  onAlertClick,
}) => {
  const [collapsed, setCollapsed] = React.useState(false)

  return (
    <div
      style={{
        position: 'absolute',
        right: 10,
        top: 10,
        width: 290,
        maxHeight: collapsed ? 72 : maxHeight,
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 12,
        boxShadow:
          '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition:
          'max-height 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow =
          '0 12px 48px 0 rgba(0, 0, 0, 0.12), 0 4px 12px 0 rgba(0, 0, 0, 0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow =
          '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)'
      }}
    >
      <div
        style={{
          padding: '20px 20px 16px',
          borderBottom: collapsed ? 'none' : '1px solid rgba(0, 0, 0, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'rgba(0, 0, 0, 0.65)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Cảnh báo
        </h4>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: '1px solid rgba(0, 0, 0, 0.1)',
            background: '#fff',
            color: '#595959',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
            lineHeight: '22px',
            padding: 0,
            transition: 'all 0.2s ease',
          }}
          aria-label={collapsed ? 'Expand alerts' : 'Collapse alerts'}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed ? 'v' : '^'}
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: collapsed ? '0 8px' : '8px',
          maxHeight: collapsed ? 0 : maxHeight,
          opacity: collapsed ? 0 : 1,
          transition:
            'max-height 0.3s ease, opacity 0.2s ease, padding 0.2s ease',
          pointerEvents: collapsed ? 'none' : 'auto',
        }}
      >
        {alerts.length === 0 ? (
          <Empty
            description="Không có cảnh báo"
            style={{ padding: '32px 0' }}
          />
        ) : (
          <List
            dataSource={alerts}
            renderItem={(alert, _index) => (
              <div
                style={{
                  padding: '12px 12px',
                  marginBottom: 8,
                  background: '#ffffff',
                  borderRadius: 8,
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                }}
                onClick={() => onAlertClick && onAlertClick(alert)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f0f7ff'
                  e.currentTarget.style.borderColor = 'rgba(24, 144, 255, 0.3)'
                  e.currentTarget.style.transform = 'translateX(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ffffff'
                  e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.06)'
                  e.currentTarget.style.transform = 'translateX(0)'
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
                >
                  <ExclamationCircleOutlined
                    style={{
                      fontSize: 18,
                      color: getSeverityColor(alert.severity),
                      marginTop: 2,
                      filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#001529',
                        marginBottom: 6,
                      }}
                    >
                      {alert.segmentName}
                    </div>
                    <p
                      style={{
                        margin: '0 0 8px 0',
                        fontSize: 13,
                        color: 'rgba(0, 0, 0, 0.65)',
                        lineHeight: 1.5,
                      }}
                    >
                      {alert.description}
                    </p>
                    <div
                      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                    >
                      <Tag
                        color={getSeverityColor(alert.severity)}
                        style={{
                          margin: 0,
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontWeight: 500,
                        }}
                      >
                        {alert.incidentType}
                      </Tag>
                      <span
                        style={{ fontSize: 11, color: 'rgba(0, 0, 0, 0.45)' }}
                      >
                        {formatRelativeTime(alert.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  )
}
