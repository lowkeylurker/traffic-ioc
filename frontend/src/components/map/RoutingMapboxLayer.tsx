// Mapbox React-map-gl layer for routing
import React, { useMemo } from 'react'
import { Source, Layer, LineLayer } from 'react-map-gl'

interface RoutingMapboxLayerProps {
  routeGeoJSON: any | null // GeoJSON FeatureCollection
  rawStart?: [number, number] | null
  rawEnd?: [number, number] | null
}

export const RoutingMapboxLayer: React.FC<RoutingMapboxLayerProps> = ({ 
  routeGeoJSON,
  rawStart,
  rawEnd 
}) => {
  // Main route styles
  const glowLayerStyle = useMemo<LineLayer>(
    () => ({
      id: 'routing-glow-layer',
      type: 'line',
      paint: {
        'line-color': '#00ffff',
        'line-width': 12,
        'line-opacity': 0.3,
        'line-blur': 6,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
    }),
    []
  )

  const coreLayerStyle = useMemo<LineLayer>(
    () => ({
      id: 'routing-core-layer',
      type: 'line',
      paint: {
        'line-color': '#00d2ff',
        'line-width': 5,
        'line-opacity': 1,
      },
      layout: { 'line-join': 'round', 'line-cap': 'round' },
    }),
    []
  )

  // Dashed lines style for connecting gaps
  const dashLayerStyle = useMemo<LineLayer>(
    () => ({
      id: 'routing-dash-layer',
      type: 'line',
      paint: {
        'line-color': '#94a3b8',
        'line-width': 2,
        'line-dasharray': [2, 2],
      },
    }),
    []
  )

  const dashGeoJSON = useMemo(() => {
    if (!routeGeoJSON?.features?.[0]?.properties) return null
    const props = routeGeoJSON.features[0].properties
    const features = []

    if (rawStart && props.startSnapped) {
      features.push({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: [rawStart, props.startSnapped]
        },
        properties: {}
      })
    }
    if (rawEnd && props.endSnapped) {
      features.push({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: [rawEnd, props.endSnapped]
        },
        properties: {}
      })
    }
    return { 
      type: 'FeatureCollection' as const, 
      features 
    }
  }, [routeGeoJSON, rawStart, rawEnd])

  if (!routeGeoJSON || !routeGeoJSON.features || routeGeoJSON.features.length === 0) {
    return null
  }

  return (
    <>
      <Source id="dynamic-route-source" type="geojson" data={routeGeoJSON}>
        <Layer {...glowLayerStyle} />
        <Layer {...coreLayerStyle} />
      </Source>
      
      {dashGeoJSON && (
        <Source id="routing-dash-source" type="geojson" data={dashGeoJSON}>
          <Layer {...dashLayerStyle} />
        </Source>
      )}
    </>
  )
}
