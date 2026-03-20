// Real-Time Operations Page

import {
  getIncidentColor,
  getIncidentIcon,
  timeAgo,
} from '@/assets/images/incidentIcons'
import { ErrorState, Loading } from '@/components/common'
import { TrafficMap } from '@/components/map/TrafficMap'
import { AlertFeed } from '@/components/widgets/AlertFeed'
import { CCTVModal } from '@/components/widgets/CCTVModal'
import { KPIBar } from '@/components/widgets/KPIBar'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { useIncidents, useSegments } from '@/hooks/useTraffic'
import { useAppStore } from '@/stores/useAppStore'
import { Alert, IncidentFeature } from '@/types'
import { useRef, useState } from 'react'
import { Marker, Popup } from 'react-map-gl'

export const RealTimePage: React.FC = () => {
  const segmentData = useSegments()
  const { incidents, liveAlerts } = useIncidents()
  const { isLoading, error } = useAppStore()
  const [cctvModalVisible, setCCTVModalVisible] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)

  const [selectedIncident, setSelectedIncident] =
    useState<IncidentFeature | null>(null)

  const handleAlertClick = (clickedAlert: Alert) => {
    const originalIncident = incidents.find((inc) => inc.id === clickedAlert.id)
    if (originalIncident && mapRef.current) {
      const [lng, lat] = originalIncident.geometry.coordinates
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 1500,
        essential: true,
      })
      setSelectedIncident(originalIncident)
    }
  }

  // Map control handlers
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomTo(mapRef.current.getZoom() + 1, { duration: 300 })
    }
  }

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomTo(mapRef.current.getZoom() - 1, { duration: 300 })
    }
  }

  const handleCompassReset = () => {
    if (mapRef.current) {
      mapRef.current.easeTo({
        bearing: 0,
        pitch: 0,
        duration: 500,
      })
    }
  }

  const handleHeatmapToggle = (_enabled: boolean) => {
    // Heatmap toggle handler
    setHeatmapEnabled(_enabled)
  }

  if (isLoading && !segmentData) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
        }}
      >
        <Loading />
      </div>
    )
  }

  if (error && !segmentData) {
    return <ErrorState message={error} />
  }

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        borderRadius: 8,
        boxShadow:
          '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
      }}
    >
      {/* Main Map - Full Coverage */}
      <TrafficMap
        segmentData={segmentData}
        style={{ height: '100%', width: '100%' }}
        mapRef={mapRef}
        heatmapEnabled={heatmapEnabled}
      >
        {incidents.map((incident) => {
          const [lng, lat] = incident.geometry.coordinates
          const isSelected = selectedIncident?.id === incident.id
          const color = getIncidentColor(incident.properties.severity)

          return (
            <Marker
              key={`marker-${incident.id}`}
              longitude={lng}
              latitude={lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                setSelectedIncident(incident)
              }}
            >
              <div
                className={`cursor-pointer rounded-full p-1.5 shadow-lg transform transition-all duration-300
                          ${isSelected ? 'scale-125 ring-2 ring-white z-50 shadow-2xl' : 'hover:scale-110'}`}
                style={{ backgroundColor: color }}
              >
                {getIncidentIcon(incident.properties.type, 18, 'white')}
              </div>
            </Marker>
          )
        })}

        {selectedIncident && (
          <Popup
            longitude={selectedIncident.geometry.coordinates[0]}
            latitude={selectedIncident.geometry.coordinates[1]}
            anchor="bottom"
            offset={15}
            closeOnClick={false}
            onClose={() => setSelectedIncident(null)}
            className="z-50 rounded-lg shadow-xl"
          >
            <div className="p-2 w-64 text-slate-800">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                <span className="font-bold text-sm tracking-wide capitalize">
                  {selectedIncident.properties.type}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${
                    selectedIncident.properties.severity === 'CRITICAL'
                      ? 'bg-red-600'
                      : selectedIncident.properties.severity === 'HIGH'
                        ? 'bg-orange-500'
                        : 'bg-yellow-500'
                  }`}
                >
                  {selectedIncident.properties.severity}
                </span>
              </div>
              <p className="text-sm mb-3 leading-relaxed text-slate-600 line-clamp-3">
                {selectedIncident.properties.description}
              </p>
              <div className="text-xs text-slate-400 font-medium flex justify-between">
                <span>ID: {selectedIncident.id}</span>
                <span>{timeAgo(selectedIncident.properties.createdAt)}</span>
              </div>
            </div>
          </Popup>
        )}
      </TrafficMap>

      {/* Floating Widgets - Z-Index Layering */}

      {/* Top KPI Bar (z-index: 20) */}
      <KPIBar />

      {/* Top Right - Alert Feed (z-index: 10) */}
      <AlertFeed alerts={liveAlerts} onAlertClick={handleAlertClick} />

      {/* Bottom Right - Map Controls (z-index: 10) */}
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onCompass={handleCompassReset}
        onCamera={() => setCCTVModalVisible(true)}
        onHeatmapToggle={handleHeatmapToggle}
      />

      {/* Bottom Right - Map Legend (z-index: 10) */}
      <MapLegend />

      {/* CCTV Modal (Hidden by default) */}
      <CCTVModal
        visible={cctvModalVisible}
        onClose={() => setCCTVModalVisible(false)}
      />
    </div>
  )
}
