// Traffic Map Component

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  TRAFFIC_COLORS,
} from '@/config/constants'
import { GeoJSONFeature, SegmentResponse } from '@/types'
import {
  AlertTriangle,
  ShieldAlert,
  TrafficCone,
} from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, LayerProps, MapRef, Popup, Source } from 'react-map-gl'

const MAX_RENDER_SEGMENTS = 12000
const MAX_FEATURES_FOR_AUTO_FIT = 50000
const MIN_RENDER_SEGMENTS = 2500
const TOMTOM_FLOW_TILE_MAX_ZOOM = 16
const TOMTOM_INCIDENT_TILE_MAX_ZOOM = 22

type MapBounds = {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

type HoveredTrafficFeature = GeoJSONFeature['properties'] & {
  trafficLevel?: number
  trafficIndex?: number
}

type TomTomSegmentDetail = {
  currentSpeed: number
  trafficLevel: number | null
}

type TomTomHoverPopupState = {
  visible: boolean
  loading: boolean
  error: string | null
  detail: TomTomSegmentDetail | null
}

type TomTomIncidentPopupState = {
  lng: number
  lat: number
  iconCategory: number | null
  magnitude: number | null
  description: string | null
}

const normalizeTrafficLevel = (value: unknown): number | null => {
  const level = Number(value)
  if (!Number.isFinite(level)) return null
  return Math.max(0, Math.min(1, level))
}

const getLosFromTomTomTrafficLevel = (trafficLevel: number | null): string => {
  if (trafficLevel === null) return 'N/A'

  const trafficIndex = 1 - trafficLevel
  if (trafficIndex <= 0.15) return 'A'
  if (trafficIndex <= 0.3) return 'B'
  if (trafficIndex <= 0.45) return 'C'
  if (trafficIndex <= 0.6) return 'D'
  if (trafficIndex <= 0.8) return 'E'
  return 'F'
}

const normalizeIncidentCategory = (value: unknown): number | null => {
  const category = Number(value)
  return Number.isFinite(category) ? category : null
}

const normalizeIncidentMagnitude = (value: unknown): number | null => {
  const magnitude = Number(value)
  return Number.isFinite(magnitude) ? magnitude : null
}

const getIncidentCategoryLabel = (iconCategory: number | null): string => {
  switch (iconCategory) {
    case 1:
      return 'Tai nạn'
    case 2:
      return 'Sương mù'
    case 3:
      return 'Điều kiện nguy hiểm'
    case 4:
      return 'Mưa lớn'
    case 5:
      return 'Băng giá'
    case 6:
      return 'Ùn tắc giao thông'
    case 7:
      return 'Hạn chế làn đường'
    case 8:
      return 'Đóng đường'
    case 9:
      return 'Công trường'
    case 10:
      return 'Gió mạnh'
    case 11:
      return 'Ngập lụt'
    case 14:
      return 'Xe hỏng'
    default:
      return 'Sự cố giao thông'
  }
}

const getIncidentMagnitudeLabel = (magnitude: number | null): string => {
  switch (magnitude) {
    case 0:
      return 'Không xác định'
    case 1:
      return 'Thấp'
    case 2:
      return 'Trung bình'
    case 3:
      return 'Cao'
    case 4:
      return 'Nghiêm trọng (Đóng đường)'
    default:
      return 'Không xác định'
  }
}

const getLosBadgeData = (los: string) => {
  const normalizedLos = (los || 'N/A').toUpperCase()

  switch (normalizedLos) {
    case 'A':
      return {
        los: 'A',
        status: 'Thông thoáng',
        statusColor: TRAFFIC_COLORS.MINIMAL,
        dotColor: TRAFFIC_COLORS.MINIMAL,
      }
    case 'B':
      return {
        los: 'B',
        status: 'Khá thông thoáng',
        statusColor: TRAFFIC_COLORS.VERY_LOW,
        dotColor: TRAFFIC_COLORS.VERY_LOW,
      }
    case 'C':
      return {
        los: 'C',
        status: 'Trung bình',
        statusColor: TRAFFIC_COLORS.MODERATE,
        dotColor: TRAFFIC_COLORS.MODERATE,
      }
    case 'D':
      return {
        los: 'D',
        status: 'Mật độ cao',
        statusColor: TRAFFIC_COLORS.HIGH,
        dotColor: TRAFFIC_COLORS.HIGH,
      }
    case 'E':
      return {
        los: 'E',
        status: 'Đông xe',
        statusColor: TRAFFIC_COLORS.VERY_HIGH,
        dotColor: TRAFFIC_COLORS.VERY_HIGH,
      }
    case 'F':
      return {
        los: 'F',
        status: 'Ùn tắc nghiêm trọng',
        statusColor: TRAFFIC_COLORS.EXTREME,
        dotColor: TRAFFIC_COLORS.EXTREME,
      }
    default:
      return {
        los: 'N/A',
        status: 'Không có dữ liệu',
        statusColor: TRAFFIC_COLORS.NO_DATA,
        dotColor: TRAFFIC_COLORS.NO_DATA,
      }
  }
}

const toRgba = (color: string, alpha: number): string => {
  const normalized = color.trim()
  const hexMatch = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i)

  if (!hexMatch) {
    return `rgba(156, 163, 175, ${alpha})`
  }

  const hex = hexMatch[1]
  const fullHex =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex

  const r = parseInt(fullHex.slice(0, 2), 16)
  const g = parseInt(fullHex.slice(2, 4), 16)
  const b = parseInt(fullHex.slice(4, 6), 16)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface TrafficMapProps {
  segmentData: SegmentResponse | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trafficStatus?: any[] // Optional traffic status data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMapClick?: (event: any) => void
  style?: React.CSSProperties
  autoRefreshInterval?: number
  mapRef?: React.RefObject<MapRef>
  segmentStatusLayerEnabled?: boolean
  useTomTomFlowTiles?: boolean
  tomTomFlowTilesUrl?: string
  useTomTomIncidentTiles?: boolean
  tomTomIncidentTilesUrl?: string
  children?: React.ReactNode
}

export const TrafficMap: React.FC<TrafficMapProps> = ({
  segmentData,
  onMapClick,
  style,
  mapRef: externalMapRef,
  segmentStatusLayerEnabled = true,
  useTomTomFlowTiles = false,
  tomTomFlowTilesUrl,
  useTomTomIncidentTiles = false,
  tomTomIncidentTilesUrl,
  children,
}) => {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapboxStyle = import.meta.env.VITE_MAPBOX_STYLE
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
  const apiOrigin = useMemo(() => {
    try {
      return new URL(apiBaseUrl, window.location.origin).origin
    } catch {
      return window.location.origin
    }
  }, [apiBaseUrl])
  const internalMapRef = useRef<MapRef | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = externalMapRef || internalMapRef
  const [hoveredFeature, setHoveredFeature] =
    useState<HoveredTrafficFeature | null>(null)
  const [viewportBounds, setViewportBounds] = useState<MapBounds | null>(null)
  const [currentZoom, setCurrentZoom] = useState<number>(DEFAULT_MAP_ZOOM)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })
  const [tomTomHoverPopup, setTomTomHoverPopup] =
    useState<TomTomHoverPopupState>({
      visible: false,
      loading: false,
      error: null,
      detail: null,
    })
  const [tomTomIncidentPopup, setTomTomIncidentPopup] =
    useState<TomTomIncidentPopupState | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const hoverAbortRef = useRef<AbortController | null>(null)
  const hoverSequenceRef = useRef(0)

  const renderCap = useMemo(() => {
    if (currentZoom < 11) return MIN_RENDER_SEGMENTS
    if (currentZoom < 12.5) return 5000
    if (currentZoom < 14) return 8000
    if (currentZoom < 15.5) return MAX_RENDER_SEGMENTS
    if (currentZoom < 17) return 18000
    return 26000
  }, [currentZoom])

  const featureBounds = useMemo(() => {
    if (!segmentData?.features?.length) return []

    return segmentData.features.map((feature) => {
      const coords = feature.geometry.coordinates
      let minLon = Infinity
      let maxLon = -Infinity
      let minLat = Infinity
      let maxLat = -Infinity

      coords.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon)
        maxLon = Math.max(maxLon, lon)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      })

      return { minLon, maxLon, minLat, maxLat }
    })
  }, [segmentData])

  const renderedSegmentData = useMemo(() => {
    if (!segmentData?.features?.length) return null

    if (!viewportBounds) {
      const featuresWithData = segmentData.features.filter(
        (f) => f.properties.losIndex && f.properties.losIndex !== 'N/A'
      )
      return {
        ...segmentData,
        features: featuresWithData.slice(0, renderCap),
      }
    }

    const visibleFeatures: GeoJSONFeature[] = []

    for (let i = 0; i < segmentData.features.length; i += 1) {
      const feature = segmentData.features[i]
      const los = feature.properties.losIndex

      if (!los || los === 'N/A') continue

      const bounds = featureBounds[i]
      if (!bounds) continue

      const intersectsViewport =
        bounds.maxLon >= viewportBounds.minLon &&
        bounds.minLon <= viewportBounds.maxLon &&
        bounds.maxLat >= viewportBounds.minLat &&
        bounds.minLat <= viewportBounds.maxLat

      if (intersectsViewport) {
        visibleFeatures.push(feature)
      }

      if (visibleFeatures.length >= renderCap) {
        break
      }
    }

    return {
      ...segmentData,
      features: visibleFeatures,
    }
  }, [featureBounds, renderCap, segmentData, viewportBounds])

  const updateViewportBounds = () => {
    if (!mapRef.current?.getMap) return

    const map = mapRef.current.getMap()
    const bounds = map.getBounds()

    if (!bounds) return

    const west = bounds.getWest()
    const east = bounds.getEast()
    const south = bounds.getSouth()
    const north = bounds.getNorth()
    const zoom = map.getZoom()

    setViewportBounds({
      minLon: west,
      maxLon: east,
      minLat: south,
      maxLat: north,
    })
    setCurrentZoom(zoom)
  }

  // Function to load TomTom-style incident icons into the map instance
  const loadTomTomIncidentIcons = useCallback((map: mapboxgl.Map) => {
    if (!map) return

    const iconConfigs = [
      { id: 'tomtom-incident-1', color: '#dc2626', type: 'accident' }, // Accident
      { id: 'tomtom-incident-2', color: '#6b7280', type: 'other' }, // Fog
      { id: 'tomtom-incident-3', color: '#dc2626', type: 'accident' }, // Dangerous Conditions
      { id: 'tomtom-incident-4', color: '#3b82f6', type: 'other' }, // Rain
      { id: 'tomtom-incident-5', color: '#3b82f6', type: 'other' }, // Ice
      { id: 'tomtom-incident-6', color: '#ef4444', type: 'jam' }, // Jam
      { id: 'tomtom-incident-7', color: '#f59e0b', type: 'closure' }, // Lane Closed
      { id: 'tomtom-incident-8', color: '#000000', type: 'closure' }, // Road Closed
      { id: 'tomtom-incident-9', color: '#f59e0b', type: 'work' }, // Road Works
      { id: 'tomtom-incident-10', color: '#6b7280', type: 'other' }, // Wind
      { id: 'tomtom-incident-11', color: '#3b82f6', type: 'other' }, // Flooding
      { id: 'tomtom-incident-14', color: '#6b7280', type: 'accident' }, // Broken Down Vehicle
      { id: 'tomtom-incident-other', color: '#6b7280', type: 'other' },
    ]

    iconConfigs.forEach(({ id, color, type }) => {
      if (map.hasImage(id)) return

      const size = 64
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // 1. Draw Background
      ctx.beginPath()
      if (type === 'accident' || type === 'work') {
        ctx.moveTo(size / 2, 8)
        ctx.lineTo(size - 4, size - 8)
        ctx.lineTo(4, size - 8)
        ctx.closePath()
      } else if (type === 'closure') {
        ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2)
      } else {
        const r = 12
        ctx.moveTo(8 + r, 8)
        ctx.lineTo(size - 8 - r, 8)
        ctx.quadraticCurveTo(size - 8, 8, size - 8, 8 + r)
        ctx.lineTo(size - 8, size - 8 - r)
        ctx.quadraticCurveTo(size - 8, size - 8, size - 8 - r, size - 8)
        ctx.lineTo(8 + r, size - 8)
        ctx.quadraticCurveTo(8, size - 8, 8, size - 8 - r)
        ctx.lineTo(8, 8 + r)
        ctx.quadraticCurveTo(8, 8, 8 + r, 8)
      }

      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      ctx.stroke()

      // 2. Draw Symbol
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      if (type === 'accident') {
        ctx.font = 'bold 32px Arial'
        ctx.fillText('!', size / 2, size / 2 + 4)
      } else if (type === 'work') {
        ctx.font = 'bold 28px Arial'
        ctx.fillText('W', size / 2, size / 2 + 6)
      } else if (type === 'closure') {
        ctx.beginPath()
        ctx.moveTo(18, size / 2)
        ctx.lineTo(size - 18, size / 2)
        ctx.lineWidth = 8
        ctx.stroke()
      } else if (type === 'jam') {
        ctx.font = 'bold 28px Arial'
        ctx.fillText('⚡', size / 2, size / 2 + 2)
      } else {
        ctx.font = 'bold 32px Arial'
        ctx.fillText('?', size / 2, size / 2)
      }

      const imageData = ctx.getImageData(0, 0, size, size)
      map.addImage(id, imageData, { pixelRatio: 2 })
    })
  }, [])

  // Re-load icons if style changes
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current.getMap()

    const onStyleLoad = () => loadTomTomIncidentIcons(map)
    map.on('style.load', onStyleLoad)

    if (map.isStyleLoaded()) {
      loadTomTomIncidentIcons(map)
    }

    return () => {
      map.off('style.load', onStyleLoad)
    }
  }, [mapRef, loadTomTomIncidentIcons])

  const resolvedTomTomIncidentTilesUrl = useMemo(() => {
    return tomTomIncidentTilesUrl || ''
  }, [tomTomIncidentTilesUrl])

  // Auto-fit map bounds when traffic data loads
  useEffect(() => {
    if (segmentData && segmentData.features.length > 0 && mapRef.current) {
      if (segmentData.features.length > MAX_FEATURES_FOR_AUTO_FIT) {
        return
      }

      const map = mapRef.current
      const bounds = segmentData.features.reduce(
        (acc, feature) => {
          const coords = feature.geometry.coordinates
          coords.forEach(([lon, lat]) => {
            acc.minLon = Math.min(acc.minLon, lon)
            acc.maxLon = Math.max(acc.maxLon, lon)
            acc.minLat = Math.min(acc.minLat, lat)
            acc.maxLat = Math.max(acc.maxLat, lat)
          })
          return acc
        },
        {
          minLon: Infinity,
          maxLon: -Infinity,
          minLat: Infinity,
          maxLat: -Infinity,
        }
      )

      if (map && bounds.minLon !== Infinity) {
        map.fitBounds(
          [
            [bounds.minLon, bounds.minLat],
            [bounds.maxLon, bounds.maxLat],
          ],
          { padding: 50, duration: 500 }
        )
      }
    }
    // mapRef is a ref object, its .current is checked but not included in dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentData])

  // Create traffic layer style
  const trafficLayerStyle = useMemo(
    () =>
      ({
        id: 'traffic-flow-layer',
        type: 'line',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],

            // Tại mức Zoom = 10
            10,
            [
              'case',
              ['==', ['get', 'isCorridor'], true],
              2.2, // Hành lang dày 2.2
              1.1, // Đường thường cũng dày 2.2
            ],

            // Tại mức Zoom = 14
            14,
            [
              'case',
              ['==', ['get', 'isCorridor'], true],
              3.8, // Hành lang dày lên 3.8
              1.9, // Đường thường thu nhỏ còn 1.9
            ],
          ],
          'line-color': [
            'case',
            ['==', ['get', 'losIndex'], 'N/A'],
            'rgba(0,0,0,0)',
            ['coalesce', ['get', 'color'], 'rgba(0,0,0,0)'],
          ],
          'line-opacity': ['case', ['==', ['get', 'losIndex'], 'N/A'], 0, 0.92],
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      }) as LayerProps,
    []
  )

  // Outline/Casing layer to increase contrast on street-v12 style
  const trafficOutlineLayerStyle = useMemo(
    () =>
      ({
        id: 'traffic-flow-outline-layer',
        type: 'line',
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],

            10,
            ['case', ['==', ['get', 'isCorridor'], true], 3.2, 1.8],

            14,
            ['case', ['==', ['get', 'isCorridor'], true], 5.2, 3.0],
          ],
          'line-color': 'rgba(0, 0, 0, 0.35)',
          'line-opacity': ['case', ['==', ['get', 'losIndex'], 'N/A'], 0, 0.5],
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      }) as LayerProps,
    []
  )

  const tomTomFlowLayerStyle = useMemo(
    () =>
      ({
        id: 'tomtom-traffic-flow-layer',
        type: 'line',
        source: 'tomtom-flow-source',
        'source-layer': 'Traffic flow',
        paint: {
          // Quy doi theo data-pipeline: traffic_index = 1 - traffic_level
          // Nguong LOS (HCM 2010): A<=0.15, B<=0.30, C<=0.45, D<=0.60, E<=0.80, F>0.80
          'line-color': [
            'let',
            'trafficIndex',
            ['-', 1, ['to-number', ['coalesce', ['get', 'traffic_level'], 0]]],
            [
              'case',
              ['<=', ['var', 'trafficIndex'], 0.15],
              TRAFFIC_COLORS.MINIMAL,
              ['<=', ['var', 'trafficIndex'], 0.3],
              TRAFFIC_COLORS.VERY_LOW,
              ['<=', ['var', 'trafficIndex'], 0.45],
              TRAFFIC_COLORS.MODERATE,
              ['<=', ['var', 'trafficIndex'], 0.6],
              TRAFFIC_COLORS.HIGH,
              ['<=', ['var', 'trafficIndex'], 0.8],
              TRAFFIC_COLORS.VERY_HIGH,
              TRAFFIC_COLORS.EXTREME,
            ],
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            3,
            12,
            4,
            16,
            5,
          ],
          'line-opacity': 0.95,
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
      }) as LayerProps,
    []
  )

  const tomTomIncidentLineLayerStyle = useMemo(
    () =>
      ({
        id: 'tomtom-incident-line-layer',
        type: 'line',
        source: 'tomtom-incident-source',
        'source-layer': 'Traffic incident flow',
        paint: {
          'line-color': '#b91c1c',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            7,
            1.2,
            12,
            2.1,
            16,
            3.4,
          ],
          'line-opacity': 0.9,
          'line-dasharray': [2, 1.2],
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      }) as LayerProps,
    []
  )

  const tomTomIncidentPointLayerStyle = useMemo(
    () =>
      ({
        id: 'tomtom-incident-point-layer',
        type: 'symbol',
        source: 'tomtom-incident-source',
        'source-layer': 'Traffic incident POI',
        layout: {
          'icon-image': [
            'match',
            [
              'to-number',
              [
                'coalesce',
                ['get', 'icon_category'],
                ['get', 'iconCategory'],
                -1,
              ],
            ],
            1,
            'tomtom-incident-1', // Accident
            2,
            'tomtom-incident-2', // Fog
            3,
            'tomtom-incident-3', // Dangerous Conditions
            4,
            'tomtom-incident-4', // Rain
            5,
            'tomtom-incident-5', // Ice
            6,
            'tomtom-incident-6', // Jam
            7,
            'tomtom-incident-7', // Lane Closed
            8,
            'tomtom-incident-8', // Road Closed
            9,
            'tomtom-incident-9', // Roadworks
            10,
            'tomtom-incident-10', // Wind
            11,
            'tomtom-incident-11', // Flooding
            14,
            'tomtom-incident-14', // Broken Down Vehicle
            'tomtom-incident-other',
          ],
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            0.6,
            14,
            0.8,
            17,
            1.0,
            22,
            1.4,
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'center',
        },
        paint: {
          'icon-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            0.8,
            12,
            1.0,
          ],
        },
      }) as LayerProps,
    []
  )

  const tomTomIncidentPointFallbackLayerStyle = useMemo(
    () =>
      ({
        id: 'tomtom-incident-point-fallback-layer',
        type: 'circle',
        source: 'tomtom-incident-source',
        'source-layer': 'Traffic incident POI',
        paint: {
          'circle-color': '#dc2626',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
          'circle-opacity': 0.6,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            7,
            2,
            12,
            3,
            16,
            4,
          ],
        },
      }) as LayerProps,
    []
  )

  const clearTomTomHoverRequest = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }

    if (hoverAbortRef.current) {
      hoverAbortRef.current.abort()
      hoverAbortRef.current = null
    }
  }, [])

  const resetTomTomHoverPopup = useCallback(() => {
    clearTomTomHoverRequest()
    hoverSequenceRef.current += 1
    setTomTomHoverPopup({
      visible: false,
      loading: false,
      error: null,
      detail: null,
    })
  }, [clearTomTomHoverRequest])

  // Set up map layer hover events
  useEffect(() => {
    if (!mapRef.current?.getMap) return

    const map = mapRef.current.getMap()

    const layerConfigs = [
      {
        id: 'traffic-flow-layer',
        enabled: Boolean(segmentData && segmentStatusLayerEnabled),
        normalize: (
          properties: Record<string, unknown>
        ): HoveredTrafficFeature =>
          properties as unknown as HoveredTrafficFeature,
      },
    ]

    const waitForLayers = setInterval(() => {
      const missingEnabledLayer = layerConfigs.some(
        (layer) => layer.enabled && !map.getLayer(layer.id)
      )

      if (missingEnabledLayer) {
        return
      }

      clearInterval(waitForLayers)

      layerConfigs.forEach((layer) => {
        if (!layer.enabled) {
          return
        }

        const handleMouseEnter = () => {
          map.getCanvas().style.cursor = 'pointer'
        }

        const handleMouseLeave = () => {
          map.getCanvas().style.cursor = ''
          setHoveredFeature(null)
        }

        const handleMouseMove = (e: mapboxgl.MapLayerMouseEvent) => {
          if (!e.features || e.features.length === 0) {
            return
          }

          const feature = e.features[0] as GeoJSON.Feature
          const normalized = layer.normalize(
            (feature.properties ?? {}) as Record<string, unknown>
          )
          setHoveredFeature(normalized)

          const container = containerRef.current
          if (container) {
            const rect = container.getBoundingClientRect()
            setMousePosition({
              x: e.originalEvent.clientX - rect.left,
              y: e.originalEvent.clientY - rect.top,
            })
          }
        }

        map.on('mouseenter', layer.id, handleMouseEnter)
        map.on('mouseleave', layer.id, handleMouseLeave)
        map.on('mousemove', layer.id, handleMouseMove)

        // Cleanup listeners correctly when deps change.
        ;(layer as { cleanup?: () => void }).cleanup = () => {
          map.off('mouseenter', layer.id, handleMouseEnter)
          map.off('mouseleave', layer.id, handleMouseLeave)
          map.off('mousemove', layer.id, handleMouseMove)
        }
      })
    }, 100)

    return () => {
      clearInterval(waitForLayers)
      layerConfigs.forEach((layer) => {
        ;(layer as { cleanup?: () => void }).cleanup?.()
      })
    }
  }, [
    mapRef,
    segmentData,
    segmentStatusLayerEnabled,
    tomTomFlowTilesUrl,
    useTomTomFlowTiles,
  ])

  useEffect(() => {
    if (
      !useTomTomFlowTiles ||
      !tomTomFlowTilesUrl ||
      !segmentStatusLayerEnabled
    ) {
      resetTomTomHoverPopup()
      return
    }

    const layerId = 'tomtom-traffic-flow-layer'
    let cleanupLayerListeners: (() => void) | null = null

    const waitForLayer = setInterval(() => {
      if (!mapRef.current?.getMap) {
        return
      }

      const map = mapRef.current.getMap()

      if (!map.getLayer(layerId)) {
        return
      }

      clearInterval(waitForLayer)

      const handleMouseEnter = () => {
        map.getCanvas().style.cursor = 'pointer'
      }

      const handleMouseLeave = () => {
        map.getCanvas().style.cursor = ''
        resetTomTomHoverPopup()
      }

      const handleMouseMove = (e: mapboxgl.MapLayerMouseEvent) => {
        if (!e.features || e.features.length === 0) {
          return
        }

        const feature = e.features[0] as GeoJSON.Feature
        const properties = (feature.properties ?? {}) as Record<string, unknown>
        const trafficLevel = normalizeTrafficLevel(properties.traffic_level)

        map.getCanvas().style.cursor = 'pointer'

        const container = containerRef.current
        if (container) {
          const rect = container.getBoundingClientRect()
          setMousePosition({
            x: e.originalEvent.clientX - rect.left,
            y: e.originalEvent.clientY - rect.top,
          })
        }

        // Debounce timer để tránh gọi API liên tục khi chuột vẫn còn di chuyển.
        // Nếu timer cũ không được clear ở đây, request chồng request sẽ dễ gây memory leak và dữ liệu popup bị race-condition.
        clearTomTomHoverRequest()

        const requestSequence = hoverSequenceRef.current + 1
        hoverSequenceRef.current = requestSequence

        setTomTomHoverPopup({
          visible: true,
          loading: true,
          error: null,
          detail: null,
        })

        hoverTimerRef.current = window.setTimeout(() => {
          const controller = new AbortController()
          hoverAbortRef.current = controller
          const lat = e.lngLat.lat
          const lng = e.lngLat.lng

          fetch(
            `${apiOrigin}/api/traffic/segment-detail?lat=${lat}&lng=${lng}`,
            {
              signal: controller.signal,
            }
          )
            .then(async (response) => {
              const payload = await response.json().catch(() => ({}))

              if (hoverSequenceRef.current !== requestSequence) {
                return
              }

              if (!response.ok || payload?.error) {
                setTomTomHoverPopup({
                  visible: true,
                  loading: false,
                  error:
                    payload?.error || 'Không có dữ liệu cho đoạn đường này',
                  detail: null,
                })
                return
              }

              setTomTomHoverPopup({
                visible: true,
                loading: false,
                error: null,
                detail: {
                  currentSpeed: Number(payload.currentSpeed),
                  trafficLevel,
                },
              })
            })
            .catch((error: unknown) => {
              if (
                controller.signal.aborted ||
                hoverSequenceRef.current !== requestSequence
              ) {
                return
              }

              console.error('TomTom segment detail error', error)
              setTomTomHoverPopup({
                visible: true,
                loading: false,
                error: 'Không thể lấy dữ liệu thực tế cho đoạn đường này',
                detail: null,
              })
            })
            .finally(() => {
              if (hoverAbortRef.current === controller) {
                hoverAbortRef.current = null
              }
            })
        }, 300)
      }

      map.on('mouseenter', layerId, handleMouseEnter)
      map.on('mouseleave', layerId, handleMouseLeave)
      map.on('mousemove', layerId, handleMouseMove)

      cleanupLayerListeners = () => {
        map.off('mouseenter', layerId, handleMouseEnter)
        map.off('mouseleave', layerId, handleMouseLeave)
        map.off('mousemove', layerId, handleMouseMove)
      }
    }, 100)

    return () => {
      clearInterval(waitForLayer)
      clearTomTomHoverRequest()
      cleanupLayerListeners?.()
    }
  }, [
    apiOrigin,
    clearTomTomHoverRequest,
    mapRef,
    resetTomTomHoverPopup,
    segmentStatusLayerEnabled,
    tomTomFlowTilesUrl,
    useTomTomFlowTiles,
  ])

  useEffect(() => {
    if (!useTomTomIncidentTiles || !resolvedTomTomIncidentTilesUrl) {
      setTomTomIncidentPopup(null)
      return
    }

    const pointLayerId = 'tomtom-incident-point-layer'
    const fallbackPointLayerId = 'tomtom-incident-point-fallback-layer'
    let cleanupLayerListeners: (() => void) | null = null

    const waitForLayer = setInterval(() => {
      if (!mapRef.current?.getMap) {
        return
      }

      const map = mapRef.current.getMap()
      if (!map.getLayer(pointLayerId) && !map.getLayer(fallbackPointLayerId)) {
        return
      }

      clearInterval(waitForLayer)

      const handleMouseEnter = (e: mapboxgl.MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = 'pointer'
        handleIncidentHover(e)
      }

      const handleMouseLeave = () => {
        map.getCanvas().style.cursor = ''
        setTomTomIncidentPopup(null)
      }

      const handleIncidentHover = (e: mapboxgl.MapLayerMouseEvent) => {
        e.originalEvent.stopPropagation()

        const feature = e.features?.[0] as GeoJSON.Feature | undefined
        if (!feature) {
          setTomTomIncidentPopup(null)
          return
        }

        const properties = (feature.properties ?? {}) as Record<string, unknown>
        const description =
          String(
            properties.description ||
              properties.event_description ||
              properties.short_description ||
              ''
          ).trim() || null

        const lng = e.lngLat?.lng
        const lat = e.lngLat?.lat

        if (typeof lng !== 'number' || typeof lat !== 'number') {
          return
        }

        setTomTomIncidentPopup({
          lng,
          lat,
          iconCategory: normalizeIncidentCategory(
            properties.icon_category ?? properties.iconCategory
          ),
          magnitude: normalizeIncidentMagnitude(
            properties.magnitude ?? properties.incident_magnitude
          ),
          description,
        })
      }

      if (map.getLayer(pointLayerId)) {
        map.on('mouseenter', pointLayerId, handleMouseEnter)
        map.on('mouseleave', pointLayerId, handleMouseLeave)
      }

      if (map.getLayer(fallbackPointLayerId)) {
        map.on('mouseenter', fallbackPointLayerId, handleMouseEnter)
        map.on('mouseleave', fallbackPointLayerId, handleMouseLeave)
      }

      cleanupLayerListeners = () => {
        if (map.getLayer(pointLayerId)) {
          map.off('mouseenter', pointLayerId, handleMouseEnter)
          map.off('mouseleave', pointLayerId, handleMouseLeave)
        }

        if (map.getLayer(fallbackPointLayerId)) {
          map.off('mouseenter', fallbackPointLayerId, handleMouseEnter)
          map.off('mouseleave', fallbackPointLayerId, handleMouseLeave)
        }
      }
    }, 100)

    return () => {
      clearInterval(waitForLayer)
      cleanupLayerListeners?.()
    }
  }, [mapRef, resolvedTomTomIncidentTilesUrl, useTomTomIncidentTiles])

  const tomTomLosBadge = tomTomHoverPopup.detail
    ? getLosBadgeData(
        getLosFromTomTomTrafficLevel(tomTomHoverPopup.detail.trafficLevel)
      )
    : null
  const tomTomBadgeColor = tomTomLosBadge?.statusColor || '#9CA3AF'
  const tomTomPopupBorderColor = toRgba(tomTomBadgeColor, 0.72)
  const tomTomPopupGradientStart = toRgba(tomTomBadgeColor, 0.24)
  const tomTomPopupGradientEnd = toRgba(tomTomBadgeColor, 0.1)
  const tomTomPopupShadowColor = toRgba(tomTomBadgeColor, 0.24)

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    >
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: DEFAULT_MAP_CENTER[0],
          latitude: DEFAULT_MAP_CENTER[1],
          zoom: DEFAULT_MAP_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapboxStyle}
        mapboxAccessToken={mapboxToken}
        onClick={onMapClick}
        onLoad={(e) => {
          updateViewportBounds()
          loadTomTomIncidentIcons(e.target)
        }}
        onMoveEnd={updateViewportBounds}
      >
        {renderedSegmentData &&
          renderedSegmentData.features.length > 0 &&
          segmentStatusLayerEnabled && (
            <Source
              id="traffic-source"
              type="geojson"
              data={renderedSegmentData}
            >
              <Layer {...trafficOutlineLayerStyle} />
              <Layer {...trafficLayerStyle} />
            </Source>
          )}

        {useTomTomFlowTiles &&
          tomTomFlowTilesUrl &&
          segmentStatusLayerEnabled && (
            <Source
              id="tomtom-flow-source"
              type="vector"
              tiles={[tomTomFlowTilesUrl]}
              minzoom={0}
              // Keep maxzoom at provider-supported level so map can overzoom instead of requesting empty high-z tiles.
              maxzoom={TOMTOM_FLOW_TILE_MAX_ZOOM}
            >
              <Layer {...tomTomFlowLayerStyle} />
            </Source>
          )}

        {/* Render children components (e.g., other custom layers) */}
        {children}

        {useTomTomIncidentTiles && resolvedTomTomIncidentTilesUrl && (
          <Source
            id="tomtom-incident-source"
            type="vector"
            tiles={[resolvedTomTomIncidentTilesUrl]}
            minzoom={0}
            maxzoom={TOMTOM_INCIDENT_TILE_MAX_ZOOM}
          >
            <Layer {...tomTomIncidentLineLayerStyle} />
            <Layer {...tomTomIncidentPointFallbackLayerStyle} />
            <Layer {...tomTomIncidentPointLayerStyle} />
          </Source>
        )}

        {tomTomIncidentPopup && (
          <Popup
            longitude={tomTomIncidentPopup.lng}
            latitude={tomTomIncidentPopup.lat}
            anchor="bottom"
            closeButton={false}
            closeOnClick={false}
            onClose={() => setTomTomIncidentPopup(null)}
            maxWidth="260px"
          >
            <div
              style={{
                minWidth: 180,
                maxWidth: 240,
                fontFamily: 'Inter, sans-serif',
                padding: '2px',
                pointerEvents: 'none',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid #F3F4F6',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background:
                      [7, 8].includes(tomTomIncidentPopup.iconCategory || -1)
                        ? '#000000' // Black for closures
                        : [1, 3, 11].includes(
                            tomTomIncidentPopup.iconCategory || -1
                          )
                          ? '#FEE2E2' // Red for accidents/danger
                          : '#FEF3C7', // Amber for works/jams
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {[7, 8].includes(tomTomIncidentPopup.iconCategory || -1) ? (
                    <ShieldAlert size={16} color="#FFFFFF" />
                  ) : [1, 3, 11].includes(
                      tomTomIncidentPopup.iconCategory || -1
                    ) ? (
                    <AlertTriangle size={16} color="#DC2626" />
                  ) : (
                    <TrafficCone size={16} color="#D97706" />
                  )}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#111827',
                    lineHeight: 1.2,
                  }}
                >
                  {getIncidentCategoryLabel(tomTomIncidentPopup.iconCategory)}
                </div>
              </div>

              {/* Body */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}
                >
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#9CA3AF',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                    }}
                  >
                    Mức độ:
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color:
                        tomTomIncidentPopup.magnitude &&
                        tomTomIncidentPopup.magnitude > 2
                          ? '#DC2626'
                          : '#4B5563',
                    }}
                  >
                    {getIncidentMagnitudeLabel(tomTomIncidentPopup.magnitude)}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    color: '#374151',
                    lineHeight: 1.4,
                    fontWeight: 500,
                  }}
                >
                  {tomTomIncidentPopup.description || 'Không có mô tả chi tiết'}
                </div>
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {tomTomHoverPopup.visible && (
        <div
          style={{
            position: 'absolute',
            left: `${mousePosition.x + 15}px`,
            top: `${mousePosition.y - 10}px`,
            zIndex: 25,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background:
                `linear-gradient(140deg, ${tomTomPopupGradientStart} 0%, ` +
                'rgba(255, 255, 255, 0.96) 52%, ' +
                `${tomTomPopupGradientEnd} 100%)`,
              backdropFilter: 'blur(10px) saturate(125%)',
              border: `1.5px solid ${tomTomPopupBorderColor}`,
              outline: '1px solid rgba(255, 255, 255, 0.85)',
              borderRadius: '12px',
              padding: '12px',
              minWidth: '220px',
              boxShadow:
                `0 10px 26px -8px ${tomTomPopupShadowColor}, ` +
                '0 8px 24px 0 rgba(15, 23, 42, 0.2)',
              fontFamily: 'sans-serif',
            }}
          >
            <div style={{ marginBottom: '10px' }}>
              <div
                style={{
                  color: '#6B7280',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Dữ liệu tốc độ thực tế
              </div>
            </div>

            {tomTomHoverPopup.loading ? (
              <div>
                <div
                  style={{
                    height: '18px',
                    borderRadius: '999px',
                    background:
                      'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 37%, #e5e7eb 63%)',
                    backgroundSize: '400% 100%',
                    animation: 'pulse 1.2s ease-in-out infinite',
                    marginBottom: '10px',
                  }}
                />
                <div
                  style={{
                    height: '14px',
                    borderRadius: '999px',
                    background: '#f3f4f6',
                    marginBottom: '8px',
                    width: '85%',
                  }}
                />
                <div
                  style={{
                    height: '14px',
                    borderRadius: '999px',
                    background: '#f3f4f6',
                    width: '65%',
                  }}
                />
              </div>
            ) : tomTomHoverPopup.error ? (
              <div
                style={{
                  color: '#b91c1c',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              >
                {tomTomHoverPopup.error}
              </div>
            ) : tomTomHoverPopup.detail ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span
                      style={{
                        fontSize: '30px',
                        fontWeight: 'bold',
                        color: '#111827',
                        lineHeight: '1',
                      }}
                    >
                      {Math.round(tomTomHoverPopup.detail.currentSpeed)}
                    </span>
                    <span
                      style={{
                        color: '#6B7280',
                        fontSize: '12px',
                        marginLeft: '4px',
                      }}
                    >
                      km/h
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      backgroundColor: toRgba(tomTomBadgeColor, 0.14),
                      border: `1px solid ${toRgba(tomTomBadgeColor, 0.35)}`,
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: tomTomLosBadge?.dotColor || '#9CA3AF',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        letterSpacing: '-0.025em',
                        color: tomTomLosBadge?.statusColor || '#6B7280',
                      }}
                    >
                      {tomTomLosBadge?.status || 'Không có dữ liệu'}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Hover Popup */}
      {hoveredFeature &&
        (() => {
          const getPopUpData = (feature: GeoJSONFeature['properties']) => {
            const los = (feature.losIndex || 'N/A').toUpperCase()

            switch (los) {
              case 'A':
                return {
                  los,
                  status: 'Thông thoáng',
                  statusColor: TRAFFIC_COLORS.MINIMAL,
                  dotColor: TRAFFIC_COLORS.MINIMAL,
                }
              case 'B':
                return {
                  los,
                  status: 'Khá thông thoáng',
                  statusColor: TRAFFIC_COLORS.VERY_LOW,
                  dotColor: TRAFFIC_COLORS.VERY_LOW,
                }
              case 'C':
                return {
                  los,
                  status: 'Trung bình',
                  statusColor: TRAFFIC_COLORS.MODERATE,
                  dotColor: TRAFFIC_COLORS.MODERATE,
                }
              case 'D':
                return {
                  los,
                  status: 'Mật độ cao',
                  statusColor: TRAFFIC_COLORS.HIGH,
                  dotColor: TRAFFIC_COLORS.HIGH,
                }
              case 'E':
                return {
                  los,
                  status: 'Đông xe',
                  statusColor: TRAFFIC_COLORS.VERY_HIGH,
                  dotColor: TRAFFIC_COLORS.VERY_HIGH,
                }
              case 'F':
                return {
                  los,
                  status: 'Ùn tắc nghiêm trọng',
                  statusColor: TRAFFIC_COLORS.EXTREME,
                  dotColor: TRAFFIC_COLORS.EXTREME,
                }
              default:
                return {
                  los: 'N/A',
                  status: 'Không có dữ liệu',
                  statusColor: TRAFFIC_COLORS.NO_DATA,
                  dotColor: TRAFFIC_COLORS.NO_DATA,
                }
            }
          }

          const popUpData = getPopUpData(hoveredFeature)
          const legacyPopupBorderColor = toRgba(popUpData.statusColor, 0.72)
          const legacyPopupGradientStart = toRgba(popUpData.statusColor, 0.24)
          const legacyPopupGradientEnd = toRgba(popUpData.statusColor, 0.1)
          const legacyPopupShadowColor = toRgba(popUpData.statusColor, 0.24)

          return (
            <div
              style={{
                position: 'absolute',
                left: `${mousePosition.x + 15}px`,
                top: `${mousePosition.y - 10}px`,
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  background:
                    `linear-gradient(140deg, ${legacyPopupGradientStart} 0%, ` +
                    'rgba(255, 255, 255, 0.96) 52%, ' +
                    `${legacyPopupGradientEnd} 100%)`,
                  backdropFilter: 'blur(10px) saturate(125%)',
                  border: `1.5px solid ${legacyPopupBorderColor}`,
                  outline: '1px solid rgba(255, 255, 255, 0.85)',
                  borderRadius: '12px',
                  padding: '16px',
                  minWidth: '220px',
                  boxShadow:
                    `0 10px 26px -8px ${legacyPopupShadowColor}, ` +
                    '0 8px 24px 0 rgba(15, 23, 42, 0.2)',
                  fontFamily: 'sans-serif',
                }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <div
                    style={{
                      color: '#1F2937',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {hoveredFeature.segmentName || 'Đoạn đường'}
                  </div>
                  <div
                    style={{
                      color: '#9CA3AF',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    ID: {hoveredFeature.segmentId}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span
                      style={{
                        fontSize: '30px',
                        fontWeight: 'bold',
                        color: '#111827',
                        lineHeight: '1',
                      }}
                    >
                      {Math.round(hoveredFeature.avgSpeed || 0)}
                    </span>
                    <span
                      style={{
                        color: '#6B7280',
                        fontSize: '12px',
                        marginLeft: '4px',
                      }}
                    >
                      km/h
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(255, 255, 255, 0.5)',
                      border: '1px solid #FFFFFF',
                    }}
                  >
                    <span
                      className="animate-pulse"
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: popUpData.dotColor,
                      }}
                    ></span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        letterSpacing: '-0.025em',
                        color: popUpData.statusColor,
                      }}
                    >
                      {popUpData.status}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(243, 244, 246, 0.5)',
                  }}
                >
                  <div style={{ color: '#6B7280', fontSize: '11px' }}>
                    Mức LOS:{' '}
                    <span style={{ fontWeight: 'bold', color: '#374151' }}>
                      {popUpData.los}
                    </span>
                  </div>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>
                    Cập nhật:{' '}
                    {hoveredFeature.lastUpdated
                      ? new Date(hoveredFeature.lastUpdated).toLocaleString(
                          'vi-VN',
                          {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          }
                        )
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
