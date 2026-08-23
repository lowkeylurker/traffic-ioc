// Incident Layer Component (A2)
import { IncidentFeature, IncidentSeverity, IncidentType } from '@/types'
import { formatDateTimeInTimeZone } from '@/utils/format'
import {
  ExclamationCircleOutlined,
  FireOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Tag } from 'antd'
import React, { useEffect, useMemo, useState } from 'react'
import { Marker, Popup } from 'react-map-gl'

interface IncidentLayerProps {
  incidents: IncidentFeature[]
  isLoading?: boolean
  onIncidentClick?: (incident: IncidentFeature) => void
  mapRef?: React.RefObject<unknown>

  selectedIncident?: IncidentFeature | null
  onSelectedIncidentChange?: (incident: IncidentFeature | null) => void
}

type ZoomAwareMap = {
  on: (event: string, listener: () => void) => void
  off: (event: string, listener: () => void) => void
  getZoom: () => number
}

type MapRefLike = {
  getMap?: () => ZoomAwareMap
} & Partial<ZoomAwareMap>

// Icon mapping for incident types (outlined icons)
const INCIDENT_ICONS: Record<IncidentType, React.ReactNode> = {
  ACCIDENT: <WarningOutlined />,
  FLOOD: <ExclamationCircleOutlined />,
  CONSTRUCTION: <ToolOutlined />,
  FIRE: <FireOutlined />,
  OTHER: <ExclamationCircleOutlined />,
}

// Severity colors
const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  CRITICAL: '#ff0000',
  HIGH: '#ff7a45',
  MEDIUM: '#faad14',
  LOW: '#1890ff',
}

export const IncidentLayer: React.FC<IncidentLayerProps> = ({
  incidents,
  isLoading,
  onIncidentClick,
  mapRef,
  selectedIncident: controlledSelectedIncident,
  onSelectedIncidentChange,
}) => {
  const [uncontrolledSelectedIncident, setUncontrolledSelectedIncident] =
    useState<IncidentFeature | null>(null)
  const [currentZoom, setCurrentZoom] = useState<number>(12)

  const selectedIncident =
    controlledSelectedIncident !== undefined
      ? controlledSelectedIncident
      : uncontrolledSelectedIncident

  const setSelectedIncident = (next: IncidentFeature | null) => {
    if (controlledSelectedIncident !== undefined) {
      onSelectedIncidentChange?.(next)
      return
    }
    setUncontrolledSelectedIncident(next)
  }

  useEffect(() => {
    if (!mapRef) return

    let rafId = 0
    let detach: (() => void) | null = null

    const attachZoomListener = () => {
      const mapObj = mapRef.current as MapRefLike | null
      const mapInstance = mapObj?.getMap?.() ?? mapObj

      if (
        typeof mapInstance?.on !== 'function' ||
        typeof mapInstance?.off !== 'function' ||
        typeof mapInstance?.getZoom !== 'function'
      ) {
        rafId = window.requestAnimationFrame(attachZoomListener)
        return
      }

      const zoomMap = mapInstance as ZoomAwareMap

      const updateZoom = () => {
        setCurrentZoom(zoomMap.getZoom())
      }

      updateZoom()
      zoomMap.on('zoom', updateZoom)
      detach = () => zoomMap.off('zoom', updateZoom)
    }

    attachZoomListener()

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
      detach?.()
    }
  }, [mapRef])

  const markerSize = useMemo(
    () => Math.max(22, Math.min(44, 22 + (currentZoom - 10) * 2.2)),
    [currentZoom]
  )
  const markerIconSize = useMemo(
    () => Math.max(16, Math.min(28, markerSize * 0.62)),
    [markerSize]
  )

  if (isLoading && incidents.length === 0) {
    return null
  }

  const handleMarkerClick = (incident: IncidentFeature) => {
    setSelectedIncident(incident)
    onIncidentClick?.(incident)
  }

  return (
    <>
      {incidents.map((incident) => {
        const [lng, lat] = incident.geometry.coordinates
        const { type, severity } = incident.properties

        return (
          <Marker
            key={incident.properties.id}
            longitude={lng}
            latitude={lat}
            onClick={(e: { originalEvent: { stopPropagation: () => void } }) => {
              e.originalEvent.stopPropagation()
              handleMarkerClick(incident)
            }}
          >
            <div
              style={{
                cursor: 'pointer',
                transform: 'translate(-50%, -50%)',
                position: 'relative',
                animation:
                  severity === 'CRITICAL' ? 'pulse 1.5s infinite' : 'none',
              }}
              title={`${incident.properties.title} (${severity})`}
              aria-label={`Sự cố: ${incident.properties.title}`}
            >
              <div
                style={{
                  width: `${markerSize}px`,
                  height: `${markerSize}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `${markerIconSize}px`,
                  color: SEVERITY_COLORS[severity],
                  filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
                  userSelect: 'none',
                }}
              >
                <span
                  style={{
                    fontSize: `${markerIconSize}px`,
                    lineHeight: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {INCIDENT_ICONS[type]}
                </span>
              </div>
            </div>
          </Marker>
        )
      })}

      {selectedIncident && (
        <Popup
          longitude={selectedIncident.geometry.coordinates[0]}
          latitude={selectedIncident.geometry.coordinates[1]}
          onClose={() => setSelectedIncident(null)}
          closeButton={true}
          closeOnClick={false}
          anchor="bottom"
          offset={20}
          maxWidth="260px"
          className="incident-popup"
        >
          <div
            style={{
              width: 'min(240px, calc(100vw - 64px))',
              maxWidth: '100%',
              boxSizing: 'border-box',
              padding: '10px',
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
              borderRadius: '8px',
            }}
          >
            {/* Header with icon and title */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <div
                style={{
                  fontSize: '24px',
                  lineHeight: '1',
                  flexShrink: 0,
                }}
              >
                {INCIDENT_ICONS[selectedIncident.properties.type]}
              </div>
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    margin: '0 0 2px 0',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#1f2937',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {selectedIncident.properties.title}
                </h3>
                <div
                  style={{
                    fontSize: '9px',
                    color: 'rgba(0,0,0,0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  {selectedIncident.properties.type}
                </div>
              </div>
            </div>

            {/* Severity badge */}
            <div style={{ marginBottom: '8px' }}>
              <Tag
                color={SEVERITY_COLORS[selectedIncident.properties.severity]}
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 8px',
                  border: 'none',
                  lineHeight: '16px',
                }}
              >
                {selectedIncident.properties.severity}
              </Tag>
            </div>

            {/* Divider */}
            <div
              style={{
                height: '1px',
                background: 'rgba(0,0,0,0.1)',
                marginBottom: '8px',
              }}
            />

            {/* Description */}
            <p
              style={{
                margin: '0 0 8px 0',
                fontSize: '12px',
                color: '#374151',
                lineHeight: '1.35',
                overflowWrap: 'anywhere',
              }}
            >
              {selectedIncident.properties.description}
            </p>

            {/* Timestamp */}
            <div
              style={{
                fontSize: '10px',
                color: '#6b7280',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: 'rgba(0,0,0,0.55)' }}>🕓</span>
              {formatDateTimeInTimeZone(selectedIncident.properties.timestamp)}
            </div>

            {/* Action button */}
            <Button
              type="primary"
              size="small"
              block
              style={{
                background: `linear-gradient(135deg, ${SEVERITY_COLORS[selectedIncident.properties.severity]}, ${SEVERITY_COLORS[selectedIncident.properties.severity]}dd)`,
                border: 'none',
                fontWeight: 600,
                height: '28px',
                fontSize: '12px',
              }}
            >
              Xử lý sự cố
            </Button>
          </div>
        </Popup>
      )}

      <style>{`
        .incident-popup .mapboxgl-popup-content {
          padding: 0;
          border-radius: 8px;
          overflow: hidden;
          max-width: min(240px, calc(100vw - 64px));
        }

        .incident-popup .mapboxgl-popup-close-button {
          right: 6px;
          top: 4px;
          font-size: 16px;
          color: #4b5563;
          line-height: 1;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
        }
      `}</style>
    </>
  )
}
