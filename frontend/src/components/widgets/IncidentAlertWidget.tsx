// Incident Alert Widget Component (A2)
import { IncidentFeature, IncidentSeverity, IncidentType } from '@/types'
import {
  DownOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  ThunderboltOutlined,
  UpOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Badge, Button, Card, Empty, List, Tag, Tooltip } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import relativeTime from 'dayjs/plugin/relativeTime'
import React, { useState } from 'react'

dayjs.extend(relativeTime)
dayjs.locale('vi')

interface IncidentAlertWidgetProps {
  incidents: IncidentFeature[]
  isLoading?: boolean
  onIncidentClick?: (incident: IncidentFeature) => void
  mapRef?: React.RefObject<unknown>
  floating?: boolean
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
  floating = true,
}) => {
  const [collapsed, setCollapsed] = useState(false)
  const handleWidth = floating ? 36 : 30

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

  if (collapsed) {
    return (
      <div
        style={{
          position: floating ? 'absolute' : 'relative',
          top: floating ? '10px' : undefined,
          right: floating ? '10px' : undefined,
          zIndex: 10,
          alignSelf: floating ? undefined : 'flex-end',
        }}
      >
        <Tooltip title="Mở cảnh báo sự cố" placement="left">
          <Button
            type="primary"
            icon={<UpOutlined />}
            onClick={() => setCollapsed(false)}
            aria-label="Mở cảnh báo sự cố"
            style={{
              height: floating ? '200px' : '120px',
              width: `${handleWidth}px`,
              borderRadius: '8px 0 0 8px',
              writingMode: 'vertical-lr',
              textOrientation: 'mixed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 8px 18px rgba(15,23,42,0.2)',
              transition: 'all 0.2s ease',
              fontWeight: 600,
            }}
          >
            Sự cố
          </Button>
        </Tooltip>
      </div>
    )
  }

  return (
    <div
      style={{
        position: floating ? 'absolute' : 'relative',
        top: floating ? '10px' : undefined,
        right: floating ? '10px' : undefined,
        zIndex: 10,
        display: 'flex',
        alignItems: 'stretch',
        width: floating ? undefined : '100%',
      }}
    >
      <Tooltip title="Thu gọn cảnh báo sự cố" placement="left">
        <Button
          icon={<DownOutlined />}
          onClick={() => setCollapsed(true)}
          aria-label="Thu gọn cảnh báo sự cố"
          style={{
            width: `${handleWidth}px`,
            height: '100%',
            minHeight: floating ? '180px' : '150px',
            borderRadius: '12px 0 0 12px',
            borderRight: 0,
            boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
            background:
              'linear-gradient(180deg, rgba(248,250,252,0.95) 0%, rgba(241,245,249,0.95) 100%)',
            transition: 'all 0.2s ease',
            borderColor: 'rgba(148, 163, 184, 0.25)',
          }}
        />
      </Tooltip>

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
          width: floating ? '300px' : `calc(100% - ${handleWidth}px)`,
          maxHeight: '560px',
          boxShadow: '0 12px 28px rgba(15,23,42,0.14)',
          borderRadius: '0 12px 12px 0',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          overflow: 'hidden',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(248,250,252,0.94) 100%)',
        }}
        headStyle={{
          padding: '10px 14px',
          minHeight: 46,
          background: 'rgba(255,255,255,0.75)',
          borderBottom: '1px solid rgba(148,163,184,0.2)',
        }}
        bodyStyle={{ padding: '0', maxHeight: '480px', overflow: 'auto' }}
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
              const { id, type, severity, title, timestamp } =
                incident.properties
              const relativeTimeText = dayjs(timestamp).fromNow()

              return (
                <List.Item
                  key={id}
                  style={{
                    padding: '10px 10px 10px 8px',
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
                    borderBottom: '1px solid rgba(148,163,184,0.12)',
                  }}
                  onClick={() => handleIncidentClick(incident)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(241,245,249,0.75)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <List.Item.Meta
                    avatar={
                      <div
                        style={{
                          fontSize: '20px',
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
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>
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
                      <div style={{ fontSize: '11px' }}>
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
      </Card>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
