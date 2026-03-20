// Incident Layer Component (A2)
import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Marker, Popup } from 'react-map-gl'
import { Button, Tag } from 'antd'
import apiService from '@/services/api'
import {
  IncidentCollection,
  IncidentFeature,
  IncidentSeverity,
  IncidentType,
} from '@/types'

interface IncidentLayerProps {
  onIncidentClick?: (incident: IncidentFeature) => void
}

// Icon mapping for incident types
const INCIDENT_ICONS: Record<IncidentType, string> = {
  ACCIDENT: '💥',
  FLOOD: '🌊',
  CONSTRUCTION: '🚧',
  FIRE: '🔥',
  OTHER: '⚠️',
}

// Severity colors
const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  CRITICAL: '#ff0000',
  HIGH: '#ff7a45',
  MEDIUM: '#faad14',
  LOW: '#1890ff',
}

export const IncidentLayer: React.FC<IncidentLayerProps> = ({
  onIncidentClick,
}) => {
  const [selectedIncident, setSelectedIncident] =
    useState<IncidentFeature | null>(null)

  // Fetch incidents using React Query with polling
  const { data: incidentData } = useQuery({
    queryKey: ['incidents'],
    queryFn: async (): Promise<IncidentCollection> => {
      const response = await apiService.get('/incidents', {
        params: { status: 'OPEN' },
      })
      return response.data
    },
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: true,
    staleTime: 0,
  })

  const incidents = incidentData?.features || []

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
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              handleMarkerClick(incident)
            }}
          >
            <div
              style={{
                cursor: 'pointer',
                fontSize: '24px',
                transform: 'translate(-50%, -50%)',
                position: 'relative',
                animation:
                  severity === 'CRITICAL' ? 'pulse 1.5s infinite' : 'none',
              }}
            >
              <div
                style={{
                  background: 'white',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `3px solid ${SEVERITY_COLORS[severity]}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                {INCIDENT_ICONS[type]}
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
        >
          <div style={{ minWidth: '250px', padding: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '20px' }}>
                {INCIDENT_ICONS[selectedIncident.properties.type]}
              </span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                {selectedIncident.properties.title}
              </h3>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <Tag
                color={SEVERITY_COLORS[selectedIncident.properties.severity]}
              >
                {selectedIncident.properties.severity}
              </Tag>
              <Tag>{selectedIncident.properties.type}</Tag>
            </div>

            <p
              style={{
                margin: '8px 0',
                fontSize: '13px',
                color: 'rgba(0,0,0,0.65)',
              }}
            >
              {selectedIncident.properties.description}
            </p>

            <div
              style={{
                fontSize: '12px',
                color: 'rgba(0,0,0,0.45)',
                marginBottom: '8px',
              }}
            >
              {new Date(selectedIncident.properties.timestamp).toLocaleString(
                'vi-VN'
              )}
            </div>

            <Button type="primary" size="small" block>
              Xử lý sự cố
            </Button>
          </div>
        </Popup>
      )}

      <style>{`
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
