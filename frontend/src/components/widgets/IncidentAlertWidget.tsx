// Incident Alert Widget Component (A2)
import React from 'react'
import { Card, List, Tag, Badge, Empty } from 'antd'
import {
  FireOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import { IncidentFeature, IncidentSeverity, IncidentType } from '@/types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/vi'

dayjs.extend(relativeTime)
dayjs.locale('vi')

interface IncidentAlertWidgetProps {
  incidents: IncidentFeature[]
  isLoading?: boolean
  onIncidentClick?: (incident: IncidentFeature) => void
  mapRef?: React.RefObject<unknown>
}

// Icon mapping
const INCIDENT_ICONS: Record<IncidentType, React.ReactNode> = {
  ACCIDENT: <WarningOutlined style={{ color: '#ff4d4f' }} />,
  FLOOD: <ThunderboltOutlined style={{ color: '#1890ff' }} />,
  CONSTRUCTION: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
  FIRE: <FireOutlined style={{ color: '#ff0000' }} />,
  OTHER: <ExclamationCircleOutlined style={{ color: '#999' }} />,
}

// Severity colors
const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  CRITICAL: 'red',
  HIGH: 'orange',
  MEDIUM: 'gold',
  LOW: 'blue',
}

export const IncidentAlertWidget: React.FC<IncidentAlertWidgetProps> = ({
  incidents,
  isLoading = false,
  onIncidentClick,
  mapRef,
}) => {
  const handleIncidentClick = (incident: IncidentFeature) => {
    const [lng, lat] = incident.geometry.coordinates

    // Fly to incident location on map
    const mapObj = mapRef?.current as {
      getMap?: () => {
        flyTo: (opts: {
          center: [number, number]
          zoom: number
          duration: number
        }) => void
      }
    } | null
    if (mapObj?.getMap) {
      const map = mapObj.getMap()
      map.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 1000,
      })
    }

    onIncidentClick?.(incident)
  }

  return (
    <Card
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            <FireOutlined style={{ marginRight: '8px' }} />
            Cảnh báo Sự cố
          </span>
          <Badge
            count={incidents.length}
            showZero
            style={{ backgroundColor: '#ff4d4f' }}
          />
        </div>
      }
      style={{
        width: '300px',
        maxHeight: '600px',
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
      bodyStyle={{ padding: '0', maxHeight: '520px', overflow: 'auto' }}
    >
      {incidents.length === 0 ? (
        <Empty
          description="Không có sự cố"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '40px 20px' }}
        />
      ) : (
        <List
          dataSource={incidents}
          loading={isLoading}
          renderItem={(incident) => {
            const { id, type, severity, title, timestamp } = incident.properties
            const relativeTimeText = dayjs(timestamp).fromNow()

            return (
              <List.Item
                key={id}
                style={{
                  padding: '8px',
                  cursor: 'pointer',
                  borderLeft: `4px solid ${
                    severity === 'CRITICAL'
                      ? '#ff0000'
                      : severity === 'HIGH'
                        ? '#ff7a45'
                        : severity === 'MEDIUM'
                          ? '#faad14'
                          : '#1890ff'
                  }`,
                  transition: 'background 0.2s',
                }}
                onClick={() => handleIncidentClick(incident)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f5f5f5'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        fontSize: '24px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {INCIDENT_ICONS[type]}
                    </div>
                  }
                  title={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span style={{ fontWeight: 500, fontSize: '14px' }}>
                        {title}
                      </span>
                      {severity === 'CRITICAL' && (
                        <Tag
                          color="red"
                          style={{
                            animation: 'blink 1.5s infinite',
                            fontWeight: 600,
                          }}
                        >
                          KHẨN CẤP
                        </Tag>
                      )}
                    </div>
                  }
                  description={
                    <div style={{ fontSize: '12px' }}>
                      <div style={{ marginBottom: '4px' }}>
                        <Tag
                          color={SEVERITY_COLORS[severity]}
                          style={{ marginRight: '4px' }}
                        >
                          {severity}
                        </Tag>
                        <Tag>{type}</Tag>
                      </div>
                      <span style={{ color: 'rgba(0,0,0,0.45)' }}>
                        {relativeTimeText}
                      </span>
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Card>
  )
}
