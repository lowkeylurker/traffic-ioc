import { GeoJSONFeature } from '@/types'
import { Card, Empty, Typography } from 'antd'
import type { Feature, FeatureCollection, LineString } from 'geojson'
import React, { memo, useEffect, useMemo, useRef } from 'react'
import Map, { Layer, MapRef, NavigationControl, Source } from 'react-map-gl'

interface HistoryMiniMapProps {
  features: GeoJSONFeature[]
  selectedRoadName?: string
}

const { Text } = Typography

const ALL_ROADS_LAYER = {
  id: 'history-all-roads-layer',
  type: 'line',
  paint: {
    'line-color': '#94a3b8',
    'line-width': 1.5,
    'line-opacity': 0.55,
  },
} as const

const SELECTED_ROAD_LAYER = {
  id: 'history-selected-road-layer',
  type: 'line',
  paint: {
    'line-color': '#dc2626',
    'line-width': 4,
    'line-opacity': 0.95,
  },
} as const

const toFeatureCollection = (
  items: GeoJSONFeature[]
): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: items.map((item) => ({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: item.geometry.coordinates,
    },
    properties: item.properties,
  })) as Feature<LineString>[],
})

const getBounds = (items: GeoJSONFeature[]) => {
  let minLng = Number.POSITIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY

  for (const feature of items) {
    for (const coord of feature.geometry.coordinates) {
      const [lng, lat] = coord
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        continue
      }
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }
  }

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]]
}

export const HistoryMiniMap = memo(function HistoryMiniMap({
  features,
  selectedRoadName,
}: HistoryMiniMapProps) {
  const mapRef = useRef<MapRef | null>(null)

  const selectedFeatures = useMemo(() => {
    if (!selectedRoadName) {
      return []
    }
    return features.filter(
      (feature) => feature.properties.roadName === selectedRoadName
    )
  }, [features, selectedRoadName])

  const allRoadGeoJson = useMemo(
    () => toFeatureCollection(features),
    [features]
  )
  const selectedRoadGeoJson = useMemo(
    () => toFeatureCollection(selectedFeatures),
    [selectedFeatures]
  )

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) {
      return
    }

    if (selectedFeatures.length > 0) {
      const bounds = getBounds(selectedFeatures)
      if (bounds) {
        map.fitBounds(bounds, {
          padding: 36,
          duration: 600,
        })
      }
      return
    }

    map.easeTo({
      center: [106.7009, 10.7769],
      zoom: 10.8,
      duration: 500,
    })
  }, [selectedFeatures])

  return (
    <Card size="small" title="Mini GIS Map">
      {features.length === 0 ? (
        <Empty description="Chưa có dữ liệu hình học" />
      ) : (
        <>
          {!selectedRoadName && (
            <Text
              type="secondary"
              style={{ display: 'block', marginBottom: 8 }}
            >
              Chọn Tên đường trong bộ lọc để highlight tuyến tương ứng.
            </Text>
          )}
          <div style={{ height: 360, borderRadius: 8, overflow: 'hidden' }}>
            <Map
              ref={mapRef}
              initialViewState={{
                longitude: 106.7009,
                latitude: 10.7769,
                zoom: 10.8,
              }}
              mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            >
              <NavigationControl position="top-right" />
              <Source
                id="history-all-road-source"
                type="geojson"
                data={allRoadGeoJson}
              >
                <Layer {...ALL_ROADS_LAYER} />
              </Source>
              <Source
                id="history-selected-road-source"
                type="geojson"
                data={selectedRoadGeoJson}
              >
                <Layer {...SELECTED_ROAD_LAYER} />
              </Source>
            </Map>
          </div>
        </>
      )}
    </Card>
  )
})
