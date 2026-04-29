import { weatherApi } from '@/services/api'
import { formatDateTimeInTimeZone } from '@/utils/format'
import { useQuery } from '@tanstack/react-query'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import mapboxgl from 'mapbox-gl'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Layer, LayerProps, Popup, Source } from 'react-map-gl'

type WeatherVoronoiProperties = {
  cell_id: string
  weather_key: number | null
  weather_id: number | null
  weather_name: string | null
  weather_category: string | null
  severity_level: number | null
  weather_color: string
  segment_count: number
  latest_timestamp: string | null
}

type WeatherVoronoiFeature = Feature<
  Polygon | MultiPolygon,
  WeatherVoronoiProperties
>

type WeatherVoronoiResponse = {
  type: 'FeatureCollection'
  features: WeatherVoronoiFeature[]
  metadata: {
    total_polygons: number
    generated_at: string
  }
}

interface WeatherVoronoiLayerProps {
  visible?: boolean
  opacity?: number
  mapRef?: React.RefObject<{ getMap?: () => mapboxgl.Map } | null>
  onLoadingChange?: (isLoading: boolean) => void
}

type HoverState = {
  lng: number
  lat: number
  properties: WeatherVoronoiProperties
}

const DEFAULT_COLOR = '#9CA3AF'

const toTitleCase = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/(^|[\s/-])([\p{L}\p{N}])/gu, (_, sep: string, ch: string) => {
      return `${sep}${ch.toLocaleUpperCase()}`
    })

const getSeverityLabel = (level: number | null): string => {
  if (level === null) return 'Không xác định'
  if (level <= 1) return 'Rất thấp'
  if (level === 2) return 'Thấp'
  if (level === 3) return 'Trung bình'
  if (level === 4) return 'Cao'
  return 'Rất cao'
}

const getWeatherIcon = (
  weatherId: number | null,
  weatherCategory: string | null
): string => {
  if (weatherId !== null) {
    if (weatherId >= 200 && weatherId <= 232) return '⛈️'
    if (weatherId >= 300 && weatherId <= 321) return '🌦️'
    if (weatherId >= 500 && weatherId <= 531) return '🌧️'
    if (weatherId >= 600 && weatherId <= 622) return '❄️'
    if (weatherId >= 701 && weatherId <= 781) return '🌫️'
    if (weatherId === 800) return '☀️'
    if (weatherId >= 801 && weatherId <= 804) return '☁️'
  }

  const cat = (weatherCategory || '').toLowerCase()
  if (cat.includes('thunder')) return '⛈️'
  if (cat.includes('drizzle')) return '🌦️'
  if (cat.includes('rain')) return '🌧️'
  if (cat.includes('snow')) return '❄️'
  if (cat.includes('mist') || cat.includes('haze') || cat.includes('fog'))
    return '🌫️'
  if (cat.includes('clear')) return '☀️'
  if (cat.includes('cloud')) return '☁️'

  return '🌤️'
}

export const WeatherVoronoiLayer: React.FC<WeatherVoronoiLayerProps> = ({
  visible = false,
  opacity = 0.26,
  mapRef,
  onLoadingChange,
}) => {
  const [hovered, setHovered] = useState<HoverState | null>(null)
  const rightHoldRef = useRef(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['weather-voronoi'],
    queryFn: async (): Promise<WeatherVoronoiResponse> => {
      const response = await weatherApi.getVoronoi()
      return response.data as WeatherVoronoiResponse
    },
    refetchInterval: 300000,
    refetchIntervalInBackground: true,
    staleTime: 120000,
    enabled: visible,
  })

  useEffect(() => {
    onLoadingChange?.(Boolean(visible && (isLoading || isFetching)))
  }, [isFetching, isLoading, onLoadingChange, visible])

  const sourceData = useMemo(
    () =>
      ({
        type: 'FeatureCollection',
        features: data?.features ?? [],
      }) as FeatureCollection<Polygon | MultiPolygon, WeatherVoronoiProperties>,
    [data]
  )

  const fillLayerStyle = useMemo(
    () =>
      ({
        id: 'weather-voronoi-fill-layer',
        type: 'fill',
        paint: {
          'fill-color': ['coalesce', ['get', 'weather_color'], DEFAULT_COLOR],
          'fill-opacity': opacity,
        },
      }) as LayerProps,
    [opacity]
  )

  const outlineLayerStyle = useMemo(
    () =>
      ({
        id: 'weather-voronoi-outline-layer',
        type: 'line',
        paint: {
          'line-color': ['coalesce', ['get', 'weather_color'], DEFAULT_COLOR],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            0.4,
            13,
            0.8,
            16,
            1.2,
          ],
          'line-opacity': Math.min(opacity + 0.18, 0.8),
        },
      }) as LayerProps,
    [opacity]
  )

  useEffect(() => {
    if (!visible || !mapRef?.current?.getMap) return

    const map = mapRef.current.getMap()
    const fillLayerId = 'weather-voronoi-fill-layer'

    const updatePopupFromEvent = (e: mapboxgl.MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      const properties = feature?.properties as
        | Record<string, string | number | null>
        | undefined

      if (!properties) {
        setHovered(null)
        return
      }

      const weather_id =
        properties.weather_id !== null && properties.weather_id !== undefined
          ? Number(properties.weather_id)
          : null

      const weather_key =
        properties.weather_key !== null && properties.weather_key !== undefined
          ? Number(properties.weather_key)
          : null

      const severity_level =
        properties.severity_level !== null &&
        properties.severity_level !== undefined
          ? Number(properties.severity_level)
          : null

      const segment_count =
        properties.segment_count !== null &&
        properties.segment_count !== undefined
          ? Number(properties.segment_count)
          : 0

      setHovered({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        properties: {
          cell_id: String(properties.cell_id ?? 'N/A'),
          weather_key,
          weather_id,
          weather_name: properties.weather_name
            ? String(properties.weather_name)
            : null,
          weather_category: properties.weather_category
            ? String(properties.weather_category)
            : null,
          severity_level,
          weather_color: String(properties.weather_color ?? DEFAULT_COLOR),
          segment_count,
          latest_timestamp: properties.latest_timestamp
            ? String(properties.latest_timestamp)
            : null,
        },
      })
    }

    const onMouseDown = (e: mapboxgl.MapLayerMouseEvent) => {
      if (e.originalEvent.button !== 2) return

      rightHoldRef.current = true
      updatePopupFromEvent(e)
      map.getCanvas().style.cursor = 'grabbing'
    }

    const onMove = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!rightHoldRef.current) return
      updatePopupFromEvent(e)
      map.getCanvas().style.cursor = 'grabbing'
    }

    const onLeave = () => {
      if (rightHoldRef.current) {
        setHovered(null)
      }
      map.getCanvas().style.cursor = ''
    }

    const onMouseUp = () => {
      rightHoldRef.current = false
      setHovered(null)
      map.getCanvas().style.cursor = ''
    }

    const onContextMenu = (e: mapboxgl.MapLayerMouseEvent) => {
      e.preventDefault()
    }

    const waitForLayer = setInterval(() => {
      if (!map.getLayer(fillLayerId)) return
      clearInterval(waitForLayer)

      map.on('mousedown', fillLayerId, onMouseDown)
      map.on('mousemove', fillLayerId, onMove)
      map.on('mouseleave', fillLayerId, onLeave)
      map.on('contextmenu', fillLayerId, onContextMenu)
      map.on('mouseup', onMouseUp)
    }, 100)

    return () => {
      clearInterval(waitForLayer)
      if (map.getLayer(fillLayerId)) {
        map.off('mousedown', fillLayerId, onMouseDown)
        map.off('mousemove', fillLayerId, onMove)
        map.off('mouseleave', fillLayerId, onLeave)
        map.off('contextmenu', fillLayerId, onContextMenu)
      }
      map.off('mouseup', onMouseUp)
      rightHoldRef.current = false
      setHovered(null)
      map.getCanvas().style.cursor = ''
    }
  }, [mapRef, visible, sourceData])

  if (!visible) return null

  return (
    <>
      <Source id="weather-voronoi-source" type="geojson" data={sourceData}>
        <Layer {...fillLayerStyle} />
        <Layer {...outlineLayerStyle} />
      </Source>

      {hovered && (
        <Popup
          longitude={hovered.lng}
          latitude={hovered.lat}
          closeButton={false}
          closeOnClick={false}
          anchor="top"
          offset={12}
          maxWidth="250px"
          className="weather-voronoi-popup"
        >
          {(() => {
            const weatherIcon = getWeatherIcon(
              hovered.properties.weather_id,
              hovered.properties.weather_category
            )
            const weatherTitle = toTitleCase(
              hovered.properties.weather_name?.trim() || 'Unknown weather'
            )

            return (
              <div
                style={{
                  width: 232,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background:
                    'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.14)',
                  border: '1px solid #e2e8f0',
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '7px 8px',
                    background: '#f1f5f9',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>
                      {weatherIcon}
                    </span>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background:
                          hovered.properties.weather_color || DEFAULT_COLOR,
                        border: '1px solid rgba(15, 23, 42, 0.2)',
                      }}
                    />
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: '#0f172a',
                      }}
                    >
                      {weatherTitle}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#475569',
                      background: '#e2e8f0',
                      padding: '2px 6px',
                      borderRadius: 999,
                      textTransform: 'uppercase',
                      letterSpacing: 0.2,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, lineHeight: 1 }}>
                      {weatherIcon}
                    </span>
                    {hovered.properties.weather_category ?? 'Unknown'}
                  </span>
                </div>

                <div style={{ padding: 8 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '86px 1fr',
                      rowGap: 4,
                      columnGap: 6,
                      fontSize: 12,
                      lineHeight: 1.3,
                    }}
                  >
                    <div style={{ color: '#64748b', fontWeight: 600 }}>
                      Weather Key
                    </div>
                    <div style={{ color: '#0f172a', fontWeight: 700 }}>
                      {hovered.properties.weather_key ?? 'N/A'}
                    </div>

                    <div style={{ color: '#64748b', fontWeight: 600 }}>
                      Weather ID
                    </div>
                    <div style={{ color: '#0f172a', fontWeight: 700 }}>
                      {hovered.properties.weather_id ?? 'N/A'}
                    </div>

                    <div style={{ color: '#64748b', fontWeight: 600 }}>
                      Độ nghiêm trọng
                    </div>
                    <div style={{ color: '#0f172a' }}>
                      {hovered.properties.severity_level ?? 'N/A'}
                      {hovered.properties.severity_level !== null
                        ? ` (${getSeverityLabel(hovered.properties.severity_level)})`
                        : ''}
                    </div>

                    <div style={{ color: '#64748b', fontWeight: 600 }}>
                      Số segment
                    </div>
                    <div style={{ color: '#0f172a' }}>
                      {hovered.properties.segment_count}
                    </div>

                    <div style={{ color: '#64748b', fontWeight: 600 }}>
                      Cell ID
                    </div>
                    <div style={{ color: '#0f172a', wordBreak: 'break-word' }}>
                      {hovered.properties.cell_id}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 6,
                      borderTop: '1px dashed #cbd5e1',
                      color: '#64748b',
                      fontSize: 10,
                    }}
                  >
                    Updated:{' '}
                    {hovered.properties.latest_timestamp
                      ? formatDateTimeInTimeZone(
                          hovered.properties.latest_timestamp
                        )
                      : 'N/A'}
                  </div>
                </div>
              </div>
            )
          })()}
        </Popup>
      )}
    </>
  )
}

export default WeatherVoronoiLayer
