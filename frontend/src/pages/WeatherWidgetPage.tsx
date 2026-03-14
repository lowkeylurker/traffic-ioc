// Weather Widget Test Page 

import { useState, useRef } from 'react'
import { TrafficMap } from '@/components/map/TrafficMap'
import { AlertFeed } from '@/components/widgets/AlertFeed'
import { KPIBar } from '@/components/widgets/KPIBar'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import { CCTVModal } from '@/components/widgets/CCTVModal'
import { WeatherWidget } from '@/components/widgets/WeatherWidget'
import { Loading, ErrorState } from '@/components/common'
import { useSegments, useTrafficStatus } from '@/hooks/useTraffic'
import { useAppStore } from '@/stores/useAppStore'
import { MOCK_ALERTS } from '@/config/constants'

export const WeatherWidgetPage: React.FC = () => {
    const segments = useSegments()
    const trafficStatus = useTrafficStatus()
    const { isLoading, error } = useAppStore()
    const [cctvModalVisible, setCCTVModalVisible] = useState(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapRef = useRef<any>(null)
    const [heatmapEnabled, setHeatmapEnabled] = useState(false)

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
        setHeatmapEnabled(_enabled)
    }

    if (isLoading && segments.length === 0) {
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

    if (error && segments.length === 0) {
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
            {/* Main Map */}
            <TrafficMap
                segments={segments}
                trafficStatus={trafficStatus}
                style={{ height: '100%', width: '100%' }}
                mapRef={mapRef}
                heatmapEnabled={heatmapEnabled}
            />

            {/* Floating Widgets */}

            <KPIBar />

            {/* Weather Widget */}
            <WeatherWidget
                style={{
                    top: 'auto',
                    bottom: 100,
                    left: 24,
                    right: 'auto'
                }}
            />

            {/* Alert Feed */}
            <AlertFeed alerts={MOCK_ALERTS} />

            {/* Map Controls */}
            <MapControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onCompass={handleCompassReset}
                onCamera={() => setCCTVModalVisible(true)}
                onHeatmapToggle={handleHeatmapToggle}
            />

            {/* Map Legend */}
            <MapLegend />

            {/* CCTV Modal */}
            <CCTVModal
                visible={cctvModalVisible}
                onClose={() => setCCTVModalVisible(false)}
            />
        </div>
    )
}
