import React, { useState, useEffect, useRef } from 'react';
import { TrafficMap } from '@/components/map/TrafficMap';
import { AlertFeed } from '@/components/widgets/AlertFeed';
import { KPIBar } from '@/components/widgets/KPIBar';
import { MapControls } from '@/components/widgets/MapControls';
import { MapLegend } from '@/components/widgets/MapLegend';
import { CCTVModal } from '@/components/widgets/CCTVModal';
import { Loading } from '@/components/common';
import { Marker, Popup } from 'react-map-gl';
import { getIncidentIcon, getIncidentColor, timeAgo } from '../assets/images/incidentIcons';
import { Alert } from '@/types';
import { useSegments, useTrafficStatus } from '@/hooks/useTraffic';
import 'mapbox-gl/dist/mapbox-gl.css';

interface IncidentProperties {
    id: number;
    type: string;
    severity: string;
    description: string;
    status: string;
    createdAt: string;
}

interface IncidentFeature {
    type: 'Feature';
    id: number;
    geometry: {
        type: 'Point';
        coordinates: [number, number]; 
    };
    properties: IncidentProperties;
}

export const TrafficIncidentPage: React.FC = () => {
    const mapRef = useRef<any>(null);
    const segments = useSegments();
    const trafficStatus = useTrafficStatus();
    const [cctvModalVisible, setCCTVModalVisible] = useState(false);
    const [heatmapEnabled, setHeatmapEnabled] = useState(false);

    const [incidents, setIncidents] = useState<IncidentFeature[]>([]);
    const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
    const [selectedIncident, setSelectedIncident] = useState<IncidentFeature | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

    const fetchIncidents = async () => {
        try {
            const res = await fetch(`${API_URL}/incident`);
            const json = await res.json();

            if (json.success && json.data && Array.isArray(json.data.features)) {
                const features: IncidentFeature[] = json.data.features;
                setIncidents(features);

                const mappedAlerts: Alert[] = features.map(feature => {
                    const typeStr = feature.properties.type.toString().toLowerCase();
                    let mappedType: 'accident' | 'congestion' | 'roadwork' | 'weather' = 'accident';
                    if (typeStr.includes('congestion') || typeStr.includes('traffic')) mappedType = 'congestion';
                    if (typeStr.includes('work') || typeStr.includes('construction')) mappedType = 'roadwork';
                    if (typeStr.includes('weather') || typeStr.includes('rain') || typeStr.includes('flood')) mappedType = 'weather';

                    const sevStr = feature.properties.severity.toString().toUpperCase();
                    let mappedSeverity: 1 | 2 | 3 | 4 | 5 = 1;
                    if (sevStr === 'CRITICAL') mappedSeverity = 5;
                    else if (sevStr === 'HIGH' || sevStr === 'MAJOR') mappedSeverity = 4;
                    else if (sevStr === 'MEDIUM' || sevStr === 'MODERATE') mappedSeverity = 3;
                    else if (sevStr === 'LOW' || sevStr === 'MINOR') mappedSeverity = 2;

                    return {
                        id: feature.id,
                        segmentId: 0,
                        segmentName: feature.properties.type,
                        incidentType: mappedType,
                        severity: mappedSeverity,
                        description: feature.properties.description,
                        timestamp: new Date(feature.properties.createdAt)
                    };
                });

                setLiveAlerts(mappedAlerts);
            }
        } catch (error) {
            console.error('Lỗi khi tải sự kiện giao thông:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIncidents();
        const interval = setInterval(fetchIncidents, 15000);
        return () => clearInterval(interval);
    }, []);

    // Map control handlers
    const handleZoomIn = () => {
        if (mapRef.current) {
            mapRef.current.zoomTo(mapRef.current.getZoom() + 1, { duration: 300 });
        }
    };

    const handleZoomOut = () => {
        if (mapRef.current) {
            mapRef.current.zoomTo(mapRef.current.getZoom() - 1, { duration: 300 });
        }
    };

    const handleCompassReset = () => {
        if (mapRef.current) {
            mapRef.current.easeTo({
                bearing: 0,
                pitch: 0,
                duration: 500,
            });
        }
    };

    const handleHeatmapToggle = (_enabled: boolean) => {
        setHeatmapEnabled(_enabled);
    };

    const handleAlertClick = (clickedAlert: Alert) => {
        const originalIncident = incidents.find(inc => inc.id === clickedAlert.id);
        if (originalIncident && mapRef.current) {
            const [lng, lat] = originalIncident.geometry.coordinates;
            mapRef.current.flyTo({ center: [lng, lat], zoom: 16, duration: 1500, essential: true });
            setSelectedIncident(originalIncident);
        }
    };

    if (loading && incidents.length === 0) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <Loading />
            </div>
        );
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
            <TrafficMap
                segments={segments}
                trafficStatus={trafficStatus}
                style={{ height: '100%', width: '100%' }}
                mapRef={mapRef}
                heatmapEnabled={heatmapEnabled}
            >
                {incidents.map((incident) => {
                    const [lng, lat] = incident.geometry.coordinates;
                    const isSelected = selectedIncident?.id === incident.id;
                    const color = getIncidentColor(incident.properties.severity);

                    return (
                        <Marker
                            key={`marker-${incident.id}`}
                            longitude={lng}
                            latitude={lat}
                            anchor="center"
                            onClick={e => {
                                e.originalEvent.stopPropagation();
                                setSelectedIncident(incident);
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
                    );
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
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${selectedIncident.properties.severity === 'CRITICAL' ? 'bg-red-600' :
                                    selectedIncident.properties.severity === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'
                                    }`}>
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

            <KPIBar />

            <AlertFeed alerts={liveAlerts} onAlertClick={handleAlertClick} />

            <MapControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onCompass={handleCompassReset}
                onCamera={() => setCCTVModalVisible(true)}
                onHeatmapToggle={handleHeatmapToggle}
            />

            <MapLegend />

            <CCTVModal
                visible={cctvModalVisible}
                onClose={() => setCCTVModalVisible(false)}
            />
        </div>
    );
};

export default TrafficIncidentPage;
