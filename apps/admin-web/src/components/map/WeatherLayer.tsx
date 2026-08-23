// Weather Layer Component - Fast rendering with direct segment visualization
import { mapConditionCodeToIcon } from '@/utils/weather'
import React, { useMemo } from 'react'
import { Layer, Marker, Source } from 'react-map-gl'

interface WeatherSegmentFeature {
  type: 'Feature'
  geometry: GeoJSON.LineString
  properties: {
    segmentId: string
    segmentName: string
    weatherId: number | null
    weatherCategory: string | null
    severityLevel: number | null
    weatherColor: string
    timestamp: string | null
  }
}

interface WeatherSegmentResponse {
  type: 'FeatureCollection'
  features: WeatherSegmentFeature[]
}

interface WeatherLayerProps {
  weatherSegments: WeatherSegmentResponse | null
  isLoading?: boolean
  _mapRef?: React.RefObject<unknown>
}

// Weather icon mapping (emoji based)
const WEATHER_ICONS: Record<string, string> = {
  sun: '☀️',
  cloud: '☁️',
  rain: '🌧️',
  storm: '⛈️',
  fog: '🌫️',
  snow: '❄️',
}

// Determine weather category from ID
const getWeatherCategory = (
  weatherId?: number,
  weatherCategory?: string | null
): string => {
  if (weatherId) {
    if (weatherId >= 200 && weatherId <= 232) return 'thunderstorm'
    else if (weatherId >= 300 && weatherId <= 321) return 'drizzle'
    else if (weatherId >= 500 && weatherId <= 531) return 'rain'
    else if (weatherId >= 600 && weatherId <= 622) return 'snow'
    else if (weatherId >= 701 && weatherId <= 781) return 'fog'
    else if (weatherId === 800) return 'clear'
    else if (weatherId >= 801 && weatherId <= 804) return 'cloudy'
  } else if (weatherCategory) {
    const cat = weatherCategory.toLowerCase()
    if (cat.includes('thunder')) return 'thunderstorm'
    else if (cat.includes('drizzle')) return 'drizzle'
    else if (cat.includes('rain')) return 'rain'
    else if (cat.includes('snow')) return 'snow'
    else if (
      cat.includes('fog') ||
      cat.includes('mist') ||
      cat.includes('haze')
    )
      return 'fog'
    else if (cat.includes('clear') || cat.includes('sunny')) return 'clear'
    else if (cat.includes('cloud')) return 'cloudy'
  }
  return 'unknown'
}

export const WeatherLayer: React.FC<WeatherLayerProps> = ({
  weatherSegments,
  isLoading,
}) => {
  // Render segments directly without geometry operations - instant rendering
  const weatherData = useMemo(() => {
    if (!weatherSegments || weatherSegments.features.length === 0) {
      return {
        type: 'FeatureCollection',
        features: [],
      } as GeoJSON.FeatureCollection
    }

    // Pass through features as-is with minimal processing
    const features = weatherSegments.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        category: getWeatherCategory(
          feature.properties.weatherId ?? undefined,
          feature.properties.weatherCategory
        ),
      },
    }))

    return {
      type: 'FeatureCollection',
      features,
    } as GeoJSON.FeatureCollection
  }, [weatherSegments])

  // Compute marker positions for weather area centers
  const markerData = useMemo(() => {
    if (!weatherSegments || weatherSegments.features.length === 0) return []

    const categoryMarkers = new Map<
      string,
      { color: string; icon: string; coords: [number, number][] }
    >()

    // Collect segment midpoints for each weather category
    weatherSegments.features.forEach((feature) => {
      const category = getWeatherCategory(
        feature.properties.weatherId ?? undefined,
        feature.properties.weatherCategory
      )
      const { weatherColor } = feature.properties
      const iconType = mapConditionCodeToIcon(
        feature.properties.weatherId ?? undefined
      )
      const icon = WEATHER_ICONS[iconType] || '☁️'

      if (!categoryMarkers.has(category)) {
        categoryMarkers.set(category, {
          color: weatherColor,
          icon,
          coords: [],
        })
      }

      // Get midpoint of segment
      const coords = feature.geometry.coordinates
      if (coords.length > 0) {
        const mid = Math.floor(coords.length / 2)
        categoryMarkers
          .get(category)!
          .coords.push(coords[mid] as [number, number])
      }
    })

    // Calculate average position for each weather category
    return Array.from(categoryMarkers.entries()).map(([category, data]) => {
      const avgLng =
        data.coords.reduce((sum, [lng]) => sum + lng, 0) / data.coords.length
      const avgLat =
        data.coords.reduce((sum, [, lat]) => sum + lat, 0) / data.coords.length

      return {
        id: `weather-marker-${category}`,
        category,
        icon: data.icon,
        lng: avgLng,
        lat: avgLat,
        color: data.color,
      }
    })
  }, [weatherSegments])

  if (isLoading && !weatherSegments) {
    return null
  }

  return (
    <>
      {/* Render weather segments directly as colored lines - instant rendering */}
      {weatherData &&
        weatherData.features &&
        weatherData.features.length > 0 && (
          <Source
            id="weather-segments-source"
            type="geojson"
            data={weatherData}
          >
            {/* Thick line layer for weather segments - visualizes weather coverage */}
            <Layer
              id="weather-segments-line"
              type="line"
              paint={{
                'line-color': ['get', 'weatherColor'],
                'line-width': 3.5,
                'line-opacity': 0.8,
              }}
            />
          </Source>
        )}

      {/* Weather icon markers - one per weather category */}
      {markerData.map((marker) => (
        <Marker
          key={marker.id}
          longitude={marker.lng}
          latitude={marker.lat}
          anchor="center"
        >
          <div
            style={{
              fontSize: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${marker.color}, ${marker.color}dd)`,
              color: '#fff',
              fontWeight: 'bold',
              border: '2px solid white',
              boxShadow: `0 4px 12px rgba(0, 0, 0, 0.25)`,
              animation: 'weather-bounce 2s ease-in-out infinite',
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
            title={`${marker.category.charAt(0).toUpperCase() + marker.category.slice(1)} Weather`}
          >
            {marker.icon}
          </div>
        </Marker>
      ))}

      <style>{`
        @keyframes weather-bounce {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-6px) scale(1.06);
          }
        }
      `}</style>
    </>
  )
}
