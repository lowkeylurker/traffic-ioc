import { EmptyState, ErrorState, Loading } from '@/components/common'
import { useCorridorOptions } from '@/hooks/useTraffic'
import { analyticsApi, mapApi } from '@/services/api'
import {
  CorridorDashboardData,
  CorridorReliabilityData,
  GeoJSONFeature,
  ReliabilitySortBy,
  ReliabilityTimeWindow,
} from '@/types'
import {
  ApartmentOutlined,
  DatabaseOutlined,
  FilterOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Modal,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import Map, {
  Layer,
  LayerProps,
  MapRef,
  NavigationControl,
  Source,
} from 'react-map-gl'
import {
  getCachedSegments,
  setCachedSegments,
} from '@/utils/segmentCache'

const { Text } = Typography

const TIME_WINDOW_LABELS: Record<string, string> = {
  AM_PEAK: 'Giờ cao điểm sáng (07:00-09:00)',
  PM_PEAK: 'Giờ cao điểm chiều (16:00-18:30)',
  OFF_PEAK: 'Giờ bình thường (ngoài cao điểm)',
}

type CorridorReliabilityItem = CorridorReliabilityData
type CorridorLimitOption = number | 'all'
type ReliabilityViewMode = 'buffer_index' | 'pti'
type ReliabilitySortOption = 'buffer_index' | 'pti'

const RELIABILITY_LIMIT_ALL = 10000
const ROAD_SEARCH_RADIUS_KM = 3
const MAX_HIGHLIGHT_SEGMENTS = 160
const PULSE_MAX_SEGMENTS = 24
const TARGET_PTI_KPI = 1.5
const HCMC_BOUNDS = {
  minLng: 106.34,
  maxLng: 107.02,
  minLat: 10.33,
  maxLat: 11.17,
}
const HCMC_CENTER: [number, number] = [106.7009, 10.7769]

interface CorridorSummaryRow {
  corridorKey: string
  corridorName: string
  segmentCount: number
  bufferIndexAvg: number
  ptiAvg: number
  tAvgSeconds: number
  tFreeflowSeconds: number
  rootCauses: {
    accident: number
    flood: number
    construction: number
  }
}

const toColorByBufferIndex = (bufferIndex: number) => {
  if (bufferIndex < 0.2) {
    return '#52c41a'
  }

  if (bufferIndex <= 0.4) {
    return '#faad14'
  }

  return '#cf1322'
}

const getLineMidpoint = (geometry: GeoJSON.LineString): [number, number] => {
  if (!geometry.coordinates.length) {
    return [106.7009, 10.7769]
  }

  const midIndex = Math.floor(geometry.coordinates.length / 2)
  const point = geometry.coordinates[midIndex]
  return [point[0], point[1]]
}

const isWithinHcmcBounds = (point: [number, number]) => {
  const [lng, lat] = point
  return (
    lng >= HCMC_BOUNDS.minLng &&
    lng <= HCMC_BOUNDS.maxLng &&
    lat >= HCMC_BOUNDS.minLat &&
    lat <= HCMC_BOUNDS.maxLat
  )
}

const distanceKmBetween = (a: [number, number], b: [number, number]) => {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371

  const [lng1, lat1] = a
  const [lng2, lat2] = b

  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)

  const h =
    sinLat * sinLat +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLng * sinLng

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const getLineBounds = (
  lines: GeoJSON.LineString[]
): [[number, number], [number, number]] | null => {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  lines.forEach((line) => {
    line.coordinates.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    })
  })

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
  ]
}

const sumOrZero = (values: Array<number | null | undefined>) => {
  const valid = values.filter(
    (value): value is number => value !== null && value !== undefined
  )

  if (valid.length === 0) {
    return 0
  }

  return valid.reduce((sum, value) => sum + value, 0)
}

const formatTravelTime = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '--'
  }

  if (seconds < 60) {
    return `${Math.round(seconds)} giây`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes} phút ${remainingSeconds} giây`
}

const formatPercent = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return '--'
  }

  return `${value.toFixed(1)}%`
}

const fetchReliabilityCorridors = async (
  timeWindow: ReliabilityTimeWindow,
  sortBy: ReliabilitySortBy,
  limit: number,
  corridorKey?: string,
  sourcePeriod?: 'WEEKLY' | 'MONTHLY',
  signal?: AbortSignal
): Promise<CorridorReliabilityItem[]> => {
  const response = await analyticsApi.getCorridorReliability(
    {
      timeWindow,
      sortBy,
      limit,
      corridorKey,
      sourcePeriod,
    },
    signal
  )

  if (!response.success || !response.data) {
    return []
  }

  return response.data.map((item) => ({
    ...item,
    bufferIndex: item.bufferIndex ?? 0,
    pti: item.pti ?? 0,
    rootCauses: item.rootCauses ?? { accident: 0, flood: 0, construction: 0 },
  }))
}

export const CorridorReliabilityTab: React.FC = () => {
  const [timeWindow, setTimeWindow] = useState<ReliabilityTimeWindow>('AM_PEAK')
  const [sourcePeriod, setSourcePeriod] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY')
  const [viewMode, setViewMode] = useState<ReliabilityViewMode>('buffer_index')
  const [segmentSortBy, setSegmentSortBy] =
    useState<ReliabilitySortOption>('buffer_index')
  const [corridorSortBy, setCorridorSortBy] =
    useState<ReliabilitySortOption>('buffer_index')
  const [selectedCorridorKey, setSelectedCorridorKey] = useState<
    string | 'all'
  >('all')
  const [corridorLimit, setCorridorLimit] = useState<CorridorLimitOption>(10)
  const { corridors: corridorOptions, loading: corridorOptionsLoading } =
    useCorridorOptions()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<CorridorReliabilityItem[]>([])
  const [activeSegmentKeys, setActiveSegmentKeys] = useState<string[]>([])
  const [pulseTick, setPulseTick] = useState(0)
  const [segmentRoadKeyMap, setSegmentRoadKeyMap] = useState<
    Record<string, string>
  >({})
  const [selectedCorridorAnalysis, setSelectedCorridorAnalysis] =
    useState<CorridorSummaryRow | null>(null)
  const [selectedCorridorDashboard, setSelectedCorridorDashboard] =
    useState<CorridorDashboardData | null>(null)
  const [availableViewportHeight, setAvailableViewportHeight] = useState<
    number | null
  >(null)
  const mapRef = useRef<MapRef | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapStyle =
    import.meta.env.VITE_MAPBOX_STYLE || 'mapbox://styles/mapbox/streets-v12'

  const shouldAnimatePulse =
    activeSegmentKeys.length > 0 &&
    activeSegmentKeys.length <= PULSE_MAX_SEGMENTS

  useEffect(() => {
    setSegmentSortBy(viewMode)
    setCorridorSortBy(viewMode)
  }, [viewMode])

  useLayoutEffect(() => {
    const updateAvailableHeight = () => {
      if (!containerRef.current) {
        return
      }

      const rect = containerRef.current.getBoundingClientRect()
      const nextHeight = Math.max(
        320,
        Math.floor(window.innerHeight - rect.top)
      )
      setAvailableViewportHeight(nextHeight)
    }

    updateAvailableHeight()
    window.addEventListener('resize', updateAvailableHeight)

    return () => {
      window.removeEventListener('resize', updateAvailableHeight)
    }
  }, [])

  useEffect(() => {
    if (!shouldAnimatePulse) {
      setPulseTick(0)
      return
    }

    const intervalId = window.setInterval(() => {
      setPulseTick((tick) => tick + 1)
    }, 120)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [shouldAnimatePulse])

  useEffect(() => {
    const controller = new AbortController()

    const loadSegmentRoadKeys = async () => {
      try {
        let segments = await getCachedSegments()

        if (!segments) {
          const response = await mapApi.getSegments()
          if (response.success && response.data) {
            segments = response.data
            await setCachedSegments(segments)
          }
        }

        if (!segments || controller.signal.aborted) {
          return
        }

        const lookup: Record<string, string> = {}
        segments.features.forEach((feature: GeoJSONFeature) => {
          const segmentId = String(feature.properties.segmentId)
          const roadKey = feature.properties.roadKey
          if (segmentId && roadKey) {
            lookup[segmentId] = String(roadKey)
          }
        })

        setSegmentRoadKeyMap(lookup)
      } catch {
        if (!controller.signal.aborted) {
          setSegmentRoadKeyMap({})
        }
      }
    }

    loadSegmentRoadKeys()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchReliabilityCorridors(
          timeWindow,
          'buffer_index',
          RELIABILITY_LIMIT_ALL,
          undefined,
          sourcePeriod,
          controller.signal
        )
 
        if (!controller.signal.aborted) {
          setRows(result)
        }
      } catch (fetchError) {
        if (
          fetchError instanceof Error &&
          fetchError.name === 'CanceledError'
        ) {
          return
        }

        setRows([])
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Không thể tải dữ liệu reliability corridor'
        )
      } finally {
        setLoading(false)
      }
    }

    loadData()

    return () => {
      controller.abort()
    }
  }, [timeWindow, sourcePeriod])

  useEffect(() => {
    const controller = new AbortController()

    const loadSelectedCorridorDashboard = async () => {
      if (!selectedCorridorAnalysis) {
        setSelectedCorridorDashboard(null)
        return
      }

      try {
        const response = await analyticsApi.getCorridorDashboard(
          {
            date: new Date().toISOString().slice(0, 10),
            corridorKey: selectedCorridorAnalysis.corridorKey,
          },
          controller.signal
        )

        if (!controller.signal.aborted) {
          setSelectedCorridorDashboard(
            response.success && response.data ? response.data : null
          )
        }
      } catch (dashboardError) {
        if (
          dashboardError instanceof Error &&
          dashboardError.name === 'CanceledError'
        ) {
          return
        }

        if (!controller.signal.aborted) {
          setSelectedCorridorDashboard(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          // Dashboard loading finished
        }
      }
    }

    loadSelectedCorridorDashboard()

    return () => {
      controller.abort()
    }
  }, [selectedCorridorAnalysis])

  const segmentRows = useMemo(() => {
    const filteredRows =
      selectedCorridorKey === 'all'
        ? rows
        : rows.filter((item) => item.corridorKey === selectedCorridorKey)

    const sorted = [...filteredRows]
    sorted.sort((a, b) => {
      const aValue =
        segmentSortBy === 'pti' ? (a.pti ?? 0) : (a.bufferIndex ?? 0)
      const bValue =
        segmentSortBy === 'pti' ? (b.pti ?? 0) : (b.bufferIndex ?? 0)
      return bValue - aValue
    })

    return sorted
  }, [rows, selectedCorridorKey, segmentSortBy])

  const focusSegmentOnMap = (segment: CorridorReliabilityItem) => {
    if (!segment.geometry || !mapRef.current) {
      return
    }

    const [longitude, latitude] = getLineMidpoint(segment.geometry)
    mapRef.current.flyTo({
      center: [longitude, latitude],
      zoom: 14,
      duration: 900,
      essential: true,
    })
  }

  const focusSegmentsOnMap = (segments: CorridorReliabilityItem[]) => {
    if (!mapRef.current || segments.length === 0) {
      return
    }

    const lines = segments
      .filter(
        (
          item
        ): item is CorridorReliabilityItem & { geometry: GeoJSON.LineString } =>
          Boolean(item.geometry)
      )
      .map((item) => item.geometry)

    const bounds = getLineBounds(lines)

    if (!bounds) {
      focusSegmentOnMap(segments[0])
      return
    }

    const map = mapRef.current.getMap()
    map.stop()
    map.fitBounds(bounds, {
      padding: { top: 60, bottom: 60, left: 60, right: 60 },
      duration: 1200,
      maxZoom: 14,
      linear: false,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      essential: true,
    })
  }

  const getRoadBasedSegmentsWithinRadius = (
    anchorSegment: CorridorReliabilityItem,
    candidates: CorridorReliabilityItem[]
  ) => {
    const roadKey = segmentRoadKeyMap[anchorSegment.segmentKey]
    if (!roadKey || !anchorSegment.geometry) {
      return [anchorSegment]
    }

    const anchorPoint = anchorSegment.geometry.coordinates[0] as [
      number,
      number,
    ]

    const matched = candidates.filter((segment) => {
      const candidateRoadKey = segmentRoadKeyMap[segment.segmentKey]
      if (
        !candidateRoadKey ||
        candidateRoadKey !== roadKey ||
        !segment.geometry
      ) {
        return false
      }

      try {
        const segmentStart = segment.geometry.coordinates[0] as [number, number]
        if (!isWithinHcmcBounds(segmentStart)) {
          return false
        }
        const distanceKm = distanceKmBetween(anchorPoint, segmentStart)
        return distanceKm < ROAD_SEARCH_RADIUS_KM
      } catch {
        return false
      }
    })

    if (matched.length === 0) {
      return [anchorSegment]
    }

    const ranked = matched
      .map((segment) => {
        const segmentStart = segment.geometry?.coordinates?.[0] as
          | [number, number]
          | undefined
        const distanceKm = segmentStart
          ? distanceKmBetween(anchorPoint, segmentStart)
          : Number.POSITIVE_INFINITY
        return { segment, distanceKm }
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_HIGHLIGHT_SEGMENTS)

    return ranked.map((item) => item.segment)
  }

  const toggleSegmentSelection = (segment: CorridorReliabilityItem) => {
    const matchedSegments = getRoadBasedSegmentsWithinRadius(
      segment,
      segmentRows
    )
    const nextKeys = matchedSegments.map((item) => item.segmentKey).sort()
    const currentKeys = [...activeSegmentKeys].sort()
    const isSameSelection =
      nextKeys.length === currentKeys.length &&
      nextKeys.every((value, index) => value === currentKeys[index])

    if (isSameSelection) {
      setActiveSegmentKeys([])
      return
    }

    setActiveSegmentKeys(nextKeys)
    focusSegmentsOnMap(matchedSegments)
  }

  const focusCorridorOnMap = (corridorKey: string) => {
    if (!mapRef.current) {
      return
    }

    const corridorSegments = rows.filter(
      (
        item
      ): item is CorridorReliabilityItem & { geometry: GeoJSON.LineString } =>
        item.corridorKey === corridorKey && Boolean(item.geometry)
    )

    if (corridorSegments.length === 0) {
      return
    }

    const inHcmcSegments = corridorSegments.filter((segment) => {
      if (!segment.geometry) {
        return false
      }
      const start = segment.geometry.coordinates[0] as [number, number]
      return isWithinHcmcBounds(start)
    })

    const anchorCandidates =
      inHcmcSegments.length > 0 ? inHcmcSegments : corridorSegments

    const anchorSegment = [...anchorCandidates].sort((a, b) => {
      const aStart = a.geometry?.coordinates?.[0] as
        | [number, number]
        | undefined
      const bStart = b.geometry?.coordinates?.[0] as
        | [number, number]
        | undefined
      const aDistance = aStart
        ? distanceKmBetween(HCMC_CENTER, aStart)
        : Number.POSITIVE_INFINITY
      const bDistance = bStart
        ? distanceKmBetween(HCMC_CENTER, bStart)
        : Number.POSITIVE_INFINITY
      return aDistance - bDistance
    })[0]

    const matchedSegments = getRoadBasedSegmentsWithinRadius(
      anchorSegment,
      anchorCandidates
    )

    setActiveSegmentKeys(matchedSegments.map((segment) => segment.segmentKey))
    focusSegmentsOnMap(matchedSegments)
  }

  const activeSegmentKeySet = useMemo(
    () => new globalThis.Set(activeSegmentKeys),
    [activeSegmentKeys]
  )

  const selectedPulseFactor = useMemo(
    () => (shouldAnimatePulse ? 0.78 + 0.22 * Math.sin(pulseTick * 0.35) : 1),
    [pulseTick, shouldAnimatePulse]
  )

  const mapGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: segmentRows
        .filter(
          (
            item
          ): item is CorridorReliabilityItem & {
            geometry: GeoJSON.LineString
          } => Boolean(item.geometry)
        )
        .map((item) => ({
          type: 'Feature',
          geometry: item.geometry,
          properties: {
            segmentKey: item.segmentKey,
            corridorId: item.corridorKey,
            corridorName: item.corridorName,
            bufferIndex: item.bufferIndex,
            lineColor: toColorByBufferIndex(item.bufferIndex ?? 0),
            isSelected: activeSegmentKeySet.has(item.segmentKey) ? 1 : 0,
          },
        })),
    }),
    [activeSegmentKeySet, segmentRows]
  )

  const lineLayer = useMemo<LayerProps>(
    () =>
      ({
        id: 'reliability-corridor-layer',
        type: 'line',
        paint: {
          'line-color': ['coalesce', ['get', 'lineColor'], '#52c41a'],
          'line-width': 5,
          'line-opacity': 0.9,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      }) as LayerProps,
    []
  )

  const selectedOutlineLayer = useMemo<LayerProps>(
    () =>
      ({
        id: 'reliability-corridor-selected-outline-layer',
        type: 'line',
        filter: ['==', ['get', 'isSelected'], 1],
        paint: {
          'line-color': '#ffffff',
          'line-width': 8 + selectedPulseFactor * 4,
          'line-opacity': 0.65 + selectedPulseFactor * 0.3,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      }) as LayerProps,
    [selectedPulseFactor]
  )

  const selectedLineLayer = useMemo<LayerProps>(
    () =>
      ({
        id: 'reliability-corridor-selected-line-layer',
        type: 'line',
        filter: ['==', ['get', 'isSelected'], 1],
        paint: {
          'line-color': ['coalesce', ['get', 'lineColor'], '#cf1322'],
          'line-width': 5 + selectedPulseFactor * 3,
          'line-opacity': 0.8 + selectedPulseFactor * 0.2,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      }) as LayerProps,
    [selectedPulseFactor]
  )

  const corridorSummaryRows = useMemo<CorridorSummaryRow[]>(() => {
    const baseRows =
      selectedCorridorKey === 'all'
        ? rows
        : rows.filter((item) => item.corridorKey === selectedCorridorKey)

    const grouped = new globalThis.Map<
      string,
      {
        corridorName: string
        segmentCount: number
        bufferSum: number
        ptiSum: number
      }
    >()

    baseRows.forEach((row) => {
      const existing = grouped.get(row.corridorKey)
      if (existing) {
        existing.segmentCount += 1
        existing.bufferSum += row.bufferIndex ?? 0
        existing.ptiSum += row.pti ?? 0
        return
      }

      grouped.set(row.corridorKey, {
        corridorName: row.corridorName,
        segmentCount: 1,
        bufferSum: row.bufferIndex ?? 0,
        ptiSum: row.pti ?? 0,
      })
    })

    const summaryRows = Array.from(grouped.entries()).map(
      ([corridorKey, value]) => {
        const corridorSegments = rows.filter(
          (item) => item.corridorKey === corridorKey
        )

        const tAvgSum = sumOrZero(corridorSegments.map((item) => item.tAvg))
        const t95Sum = sumOrZero(corridorSegments.map((item) => item.t95))
        const tFreeflowSum = sumOrZero(
          corridorSegments.map((item) => item.tFreeflow)
        )

        return {
          corridorKey,
          corridorName: value.corridorName,
          segmentCount: value.segmentCount,
          bufferIndexAvg: tAvgSum > 0 ? (t95Sum - tAvgSum) / tAvgSum : 0,
          ptiAvg: tFreeflowSum > 0 ? t95Sum / tFreeflowSum : 0,
          tAvgSeconds: tAvgSum,
          tFreeflowSeconds: tFreeflowSum,
          rootCauses: {
            accident: corridorSegments.reduce(
              (sum, item) => sum + (item.rootCauses?.accident ?? 0),
              0
            ),
            flood: corridorSegments.reduce(
              (sum, item) => sum + (item.rootCauses?.flood ?? 0),
              0
            ),
            construction: corridorSegments.reduce(
              (sum, item) => sum + (item.rootCauses?.construction ?? 0),
              0
            ),
          },
        }
      }
    )

    summaryRows.sort((a, b) => {
      const aValue = corridorSortBy === 'pti' ? a.ptiAvg : a.bufferIndexAvg
      const bValue = corridorSortBy === 'pti' ? b.ptiAvg : b.bufferIndexAvg
      return bValue - aValue
    })

    if (corridorLimit === 'all') {
      return summaryRows
    }

    return summaryRows.slice(0, corridorLimit)
  }, [corridorLimit, corridorSortBy, rows, selectedCorridorKey])

  const segmentTableColumns = [
    {
      title: 'Tên đoạn đường',
      dataIndex: 'segmentName',
      key: 'segmentName',
      ellipsis: true,
      sorter: (a: CorridorReliabilityItem, b: CorridorReliabilityItem) =>
        a.segmentName.localeCompare(b.segmentName),
      render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
    },
    {
      title: 'Hành lang',
      dataIndex: 'corridorName',
      key: 'corridorName',
      ellipsis: true,
      sorter: (a: CorridorReliabilityItem, b: CorridorReliabilityItem) =>
        a.corridorName.localeCompare(b.corridorName),
      render: (value: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {value}
        </Text>
      ),
    },
    ...(viewMode === 'buffer_index'
      ? [
          {
            title: 'Chỉ số dự phòng (BI)',
            dataIndex: 'bufferIndex',
            key: 'bufferIndex',
            defaultSortOrder:
              segmentSortBy === 'buffer_index'
                ? ('descend' as const)
                : undefined,
            sorter: (a: CorridorReliabilityItem, b: CorridorReliabilityItem) =>
              (a.bufferIndex ?? 0) - (b.bufferIndex ?? 0),
            render: (value: number) => (
              <Tag
                color={value < 0.2 ? 'green' : value <= 0.4 ? 'orange' : 'red'}
                style={{ borderRadius: 6, fontWeight: 600 }}
              >
                {value.toFixed(2)}
              </Tag>
            ),
          },
        ]
      : [
          {
            title: 'PTI (biến động)',
            dataIndex: 'pti',
            key: 'pti',
            defaultSortOrder:
              segmentSortBy === 'pti' ? ('descend' as const) : undefined,
            sorter: (a: CorridorReliabilityItem, b: CorridorReliabilityItem) =>
              (a.pti ?? 0) - (b.pti ?? 0),
            render: (value: number) => (
              <span
                style={{
                  color:
                    value <= 1.25
                      ? '#52C41A'
                      : value <= 1.5
                        ? '#FA8C16'
                        : '#F5222D',
                  fontWeight: 600,
                }}
              >
                {value.toFixed(2)}
              </span>
            ),
          },
        ]),
    {
      title: 'Thời gian di chuyển',
      dataIndex: 'tAvg',
      key: 'tAvg',
      sorter: (a: CorridorReliabilityItem, b: CorridorReliabilityItem) =>
        (a.tAvg ?? 0) - (b.tAvg ?? 0),
      render: (value: number | null) => formatTravelTime(value),
    },
    {
      title: 'Mã đoạn',
      dataIndex: 'segmentKey',
      key: 'segmentKey',
      width: 120,
      render: (value: string) => (
        <Text
          type="secondary"
          copyable
          ellipsis={{ tooltip: true }}
          style={{ fontSize: 11, fontFamily: 'monospace' }}
        >
          {value}
        </Text>
      ),
    },
  ]

  const modalSegmentColumns = segmentTableColumns.filter(
    (column) => column.key !== 'corridorName'
  )

  const corridorSummaryColumns = [
    {
      title: 'Tên hành lang',
      dataIndex: 'corridorName',
      key: 'corridorName',
      render: (value: string) => (
        <Text strong style={{ fontSize: 13 }}>
          {value}
        </Text>
      ),
    },
    ...(viewMode === 'buffer_index'
      ? [
          {
            title: 'Chỉ số BI (TB)',
            dataIndex: 'bufferIndexAvg',
            key: 'bufferIndexAvg',
            sorter: (a: CorridorSummaryRow, b: CorridorSummaryRow) =>
              b.bufferIndexAvg - a.bufferIndexAvg,
            render: (value: number) => (
              <Tag
                color={value < 0.2 ? 'green' : value <= 0.4 ? 'orange' : 'red'}
                style={{
                  borderRadius: 6,
                  fontWeight: 600,
                  minWidth: 50,
                  textAlign: 'center',
                }}
              >
                {value.toFixed(2)}
              </Tag>
            ),
          },
        ]
      : []),
    ...(viewMode === 'pti'
      ? [
          {
            title: 'PTI TB',
            dataIndex: 'ptiAvg',
            key: 'ptiAvg',
            sorter: (a: CorridorSummaryRow, b: CorridorSummaryRow) =>
              b.ptiAvg - a.ptiAvg,
            render: (value: number) => (
              <span
                style={{
                  color:
                    value <= 1.25
                      ? '#52C41A'
                      : value <= 1.5
                        ? '#FA8C16'
                        : '#F5222D',
                  fontWeight: 600,
                }}
              >
                {value.toFixed(2)}
              </span>
            ),
          },
        ]
      : []),
    {
      title: 'Thời gian đi hết',
      dataIndex: 'tAvgSeconds',
      key: 'tAvgSeconds',
      render: (value: number) => formatTravelTime(value),
    },
    {
      title: 'Phân tích',
      key: 'action',
      render: (_: unknown, row: CorridorSummaryRow) => (
        <Button
          icon={<SearchOutlined />}
          type="primary"
          size="small"
          onClick={() => setSelectedCorridorAnalysis(row)}
          style={{ borderRadius: 6 }}
        >
          Chi tiết
        </Button>
      ),
    },
  ]

  const selectedCorridorSegments = useMemo(() => {
    if (!selectedCorridorAnalysis) {
      return [] as CorridorReliabilityItem[]
    }

    const corridorSegments = rows.filter(
      (item) => item.corridorKey === selectedCorridorAnalysis.corridorKey
    )

    const sorted = [...corridorSegments]
    sorted.sort((a, b) => {
      const aValue =
        segmentSortBy === 'pti' ? (a.pti ?? 0) : (a.bufferIndex ?? 0)
      const bValue =
        segmentSortBy === 'pti' ? (b.pti ?? 0) : (b.bufferIndex ?? 0)
      return bValue - aValue
    })

    return sorted
  }, [rows, segmentSortBy, selectedCorridorAnalysis])

  const selectedCorridorInsight = useMemo(() => {
    if (!selectedCorridorAnalysis) {
      return null
    }

    const avgSeconds = selectedCorridorAnalysis.tAvgSeconds
    const freeflowSeconds = selectedCorridorAnalysis.tFreeflowSeconds

    const t95TotalSeconds = sumOrZero(
      selectedCorridorSegments.map((segment) => segment.t95)
    )
    const t95Seconds = t95TotalSeconds > 0 ? t95TotalSeconds : avgSeconds

    const delayPct =
      avgSeconds > 0 ? ((t95Seconds - avgSeconds) / avgSeconds) * 100 : null

    return {
      avgSeconds,
      freeflowSeconds,
      delayPct,
      t95Seconds,
    }
  }, [selectedCorridorAnalysis, selectedCorridorSegments])

  const reliabilityTrendData = useMemo(() => {
    if (
      !selectedCorridorDashboard?.ttiHourly ||
      selectedCorridorDashboard.ttiHourly.length === 0
    )
      return null

    return {
      labels: selectedCorridorDashboard.ttiHourly.map(
        (item) => `${item.hour}:00`
      ),
      datasets: [
        {
          label: 'Chỉ số PTI / TTI',
          data: selectedCorridorDashboard.ttiHourly.map(
            (item) => item.travelTimeIndex
          ),
          borderColor: '#1677ff',
          backgroundColor: 'rgba(22, 119, 255, 0.1)',
          fill: true,
          tension: 0.4,
        },
      ],
    }
  }, [selectedCorridorDashboard])

  const ptiDistributionData = useMemo(() => {
    if (!selectedCorridorSegments.length) return null

    let bin1 = 0
    let bin2 = 0
    let bin3 = 0
    let bin4 = 0

    selectedCorridorSegments.forEach((seg) => {
      const pti = seg.pti ?? 0
      if (pti <= 1.25) bin1++
      else if (pti <= 1.5) bin2++
      else if (pti <= 2.0) bin3++
      else bin4++
    })

    return {
      labels: ['≤ 1.25', '1.25 - 1.5', '1.5 - 2.0', '> 2.0'],
      datasets: [
        {
          label: 'Số đoạn đường',
          data: [bin1, bin2, bin3, bin4],
          backgroundColor: ['#52c41a', '#faad14', '#ff4d4f', '#a8071a'],
          borderRadius: 4,
        },
      ],
    }
  }, [selectedCorridorSegments])

  const worstSegment = useMemo(() => {
    if (!selectedCorridorSegments.length) return null
    return selectedCorridorSegments.reduce((worst, current) => {
      return (current.pti ?? 0) > (worst.pti ?? 0) ? current : worst
    }, selectedCorridorSegments[0])
  }, [selectedCorridorSegments])

  if (loading || corridorOptionsLoading || corridorOptions.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '60vh',
        }}
      >
        <Loading />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} />
  }

  return (
    <div
      ref={containerRef}
      style={{
        height:
          availableViewportHeight !== null
            ? `${availableViewportHeight}px`
            : '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>
        {`
        .ant-card-body {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .ant-table-wrapper {
          flex: 1;
        }
        .ant-spin-nested-loading {
          height: 100%;
        }
        .ant-spin-container {
            height: 100%;
            display: flex;
            flex-direction: column;
          }
        .ant-table {
          flex: 1;
  min-height: 0 !important;
  overflow-y: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
        }
          .ant-table-container {
          flex: 1;
          min-height: 0;
  height: 100% !important;
  display: flex;
  flex-direction: column;
}
  ant-table-body {
  flex: 1;
  overflow-y: auto !important;
  max-height: 100% !important;
  height: 100%;
}
        `}
      </style>

      <div
        style={{
          width: '100%',
          height: 'calc(100% - 16px)',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Card
          style={{
            background: 'linear-gradient(135deg,#f8f9fe 0%,#eef2fb 100%)',
            border: '1px solid #e8ecf5',
          }}
          bodyStyle={{ padding: '16px 20px' }}
          title={
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <Space>
                <FilterOutlined />
                <span>Bộ lọc phân tích độ tin cậy hành lang</span>
              </Space>
              <Radio.Group
                value={sourcePeriod}
                onChange={(e) => setSourcePeriod(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="WEEKLY">7 ngày gần nhất</Radio.Button>
                <Radio.Button value="MONTHLY">30 ngày gần nhất</Radio.Button>
              </Radio.Group>
            </div>
          }
        >
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={8}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Khung thời gian
                </Text>
                <Select
                  style={{ width: '100%' }}
                  value={timeWindow}
                  onChange={(value: ReliabilityTimeWindow) =>
                    setTimeWindow(value)
                  }
                  options={[
                    { label: TIME_WINDOW_LABELS['AM_PEAK'], value: 'AM_PEAK' },
                    { label: TIME_WINDOW_LABELS['PM_PEAK'], value: 'PM_PEAK' },
                    {
                      label: TIME_WINDOW_LABELS['OFF_PEAK'],
                      value: 'OFF_PEAK',
                    },
                  ]}
                  size="large"
                />
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Lọc theo hành lang
                </Text>
                <Select
                  style={{ width: '100%' }}
                  value={selectedCorridorKey}
                  onChange={(value: string | 'all') =>
                    setSelectedCorridorKey(value)
                  }
                  options={[
                    { label: 'Tất cả hành lang', value: 'all' },
                    ...corridorOptions.map((corridor) => ({
                      label: corridor.corridorName,
                      value: corridor.corridorKey,
                    })),
                  ]}
                  size="large"
                  showSearch
                  optionFilterProp="label"
                />
              </Space>
            </Col>
            <Col xs={24} md={8}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Chế độ xem
                </Text>
                <Select
                  style={{ width: '100%' }}
                  value={viewMode}
                  onChange={(value: ReliabilityViewMode) => setViewMode(value)}
                  options={[
                    {
                      label: 'Theo Buffer Index (BI)',
                      value: 'buffer_index',
                    },
                    { label: 'Theo PTI', value: 'pti' },
                  ]}
                  size="large"
                />
              </Space>
            </Col>
          </Row>
        </Card>

        {rows.length === 0 ? (
          <EmptyState message="Chưa có dữ liệu reliability corridor" />
        ) : (
          <>
            <Row gutter={[16, 16]} style={{ flex: 1, minHeight: 0 }}>
              <Col xs={24} xl={14} style={{ minHeight: 0 }}>
                <Card
                  title={
                    <Space>
                      <ApartmentOutlined />
                      <span>
                        Bản đồ độ tin cậy hành lang —{' '}
                        {TIME_WINDOW_LABELS[timeWindow]}
                      </span>
                    </Space>
                  }
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  bodyStyle={{ flex: 1, minHeight: 0 }}
                >
                  <Text
                    type="secondary"
                    style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
                  >
                    Màu sắc đoạn đường phản ánh mức độ đáng tin cậy trong khung
                    giờ đã chọn. Click vào corridor trong bảng tổng hợp để zoom
                    bản đồ.
                  </Text>
                  {mapboxToken ? (
                    <div
                      style={{
                        height: '100%',
                        minHeight: 320,
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <Map
                        ref={mapRef}
                        initialViewState={{
                          latitude: 10.7769,
                          longitude: 106.7009,
                          zoom: 12.2,
                        }}
                        mapStyle={mapStyle}
                        mapboxAccessToken={mapboxToken}
                      >
                        <NavigationControl position="top-right" />
                        <Source
                          id="reliability-corridor-source"
                          type="geojson"
                          data={mapGeoJson}
                        >
                          <Layer {...lineLayer} />
                          <Layer {...selectedOutlineLayer} />
                          <Layer {...selectedLineLayer} />
                        </Source>
                      </Map>
                    </div>
                  ) : (
                    <ErrorState message="Thiếu VITE_MAPBOX_TOKEN để hiển thị heatmap corridor" />
                  )}

                  <Space size={8} style={{ marginTop: 12 }} wrap>
                    {viewMode === 'buffer_index' ? (
                      <>
                        <Tag color="green">BI ổn định (&lt; 0.2)</Tag>
                        <Tag color="orange">BI thất thường (0.2 - 0.4)</Tag>
                        <Tag color="red">BI báo động (&gt; 0.4)</Tag>
                      </>
                    ) : (
                      <>
                        <Tag color="green">PTI ổn định (≤ 1.25)</Tag>
                        <Tag color="orange">PTI cần theo dõi (1.25 - 1.5)</Tag>
                        <Tag color="red">PTI biến động cao (&gt; 1.5)</Tag>
                      </>
                    )}
                  </Space>
                </Card>
              </Col>

              <Col xs={24} xl={10} style={{ minHeight: 0 }}>
                {corridorSummaryRows.length > 0 ? (
                  <Card
                    title={
                      <Space size={8}>
                        <DatabaseOutlined />
                        <Text strong>
                          Tổng hợp mức độ tin cậy theo hành lang (Corridor
                          Aggregate)
                        </Text>
                      </Space>
                    }
                    extra={
                      <Space size={8}>
                        <Select
                          style={{ width: 140 }}
                          value={corridorLimit}
                          onChange={(value: CorridorLimitOption) =>
                            setCorridorLimit(value)
                          }
                          options={[
                            { label: 'Tất cả', value: 'all' },
                            { label: 'Top 5', value: 5 },
                            { label: 'Top 10', value: 10 },
                            { label: 'Top 15', value: 15 },
                          ]}
                        />
                      </Space>
                    }
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    bodyStyle={{ flex: 1, padding: 4, minHeight: 0 }}
                  >
                    <Table<CorridorSummaryRow>
                      rowKey="corridorKey"
                      columns={corridorSummaryColumns}
                      dataSource={corridorSummaryRows}
                      pagination={false}
                      size="small"
                      scroll={{ y: 500 }}
                      onRow={(record) => ({
                        onClick: () => {
                          focusCorridorOnMap(record.corridorKey)
                        },
                      })}
                    />
                  </Card>
                ) : (
                  <EmptyState message="Chưa có dữ liệu tổng hợp theo hành lang" />
                )}
              </Col>
            </Row>
          </>
        )}
      </div>
      <Modal
        open={Boolean(selectedCorridorAnalysis)}
        width={1100}
        style={{ top: 50 }}
        bodyStyle={{
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
        title={
          selectedCorridorAnalysis
            ? `Chi tiết độ tin cậy - ${selectedCorridorAnalysis.corridorName}`
            : 'Chi tiết độ tin cậy'
        }
        onCancel={() => setSelectedCorridorAnalysis(null)}
        footer={null}
        destroyOnClose
      >
        {selectedCorridorAnalysis ? (
          <Row
            gutter={[16, 16]}
            style={{ display: 'flex', alignItems: 'stretch' }}
          >
            <Col xs={24} md={12} style={{ display: 'flex' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  gap: 12,
                }}
              >
                {selectedCorridorInsight && (
                  <Card size="small" title="Tóm tắt nhanh">
                    <Space
                      direction="vertical"
                      size={4}
                      style={{ width: '100%' }}
                    >
                      <Text>
                        Thời gian di chuyển trung bình:{' '}
                        <Text strong>
                          {formatTravelTime(selectedCorridorInsight.avgSeconds)}
                        </Text>
                      </Text>
                      <Text>
                        Độ trễ do biến động giao thông:{' '}
                        <Text strong>
                          {formatPercent(selectedCorridorInsight.delayPct)}
                        </Text>
                      </Text>
                      <Text>
                        Thời gian dự phòng 95% (T95):{' '}
                        <Text strong>
                          {formatTravelTime(selectedCorridorInsight.t95Seconds)}
                        </Text>
                      </Text>
                    </Space>
                  </Card>
                )}

                <Card
                  size="small"
                  title="Xu hướng độ tin cậy (24h qua)"
                  style={{ height: 260 }}
                >
                  {reliabilityTrendData ? (
                    <div style={{ height: 200 }}>
                      <Line
                        data={reliabilityTrendData}
                        options={{
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              callbacks: {
                                label: (context) =>
                                  `Chỉ số: ${context.parsed.y?.toFixed(2) ?? '--'}`,
                              },
                            },
                          },
                          scales: {
                            y: { beginAtZero: false, suggestedMin: 1 },
                          },
                        }}
                      />
                    </div>
                  ) : (
                    <EmptyState message="Chưa có dữ liệu xu hướng 24h" />
                  )}
                </Card>

                <Card
                  size="small"
                  title="Phân phối thời gian di chuyển (PTI)"
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                  bodyStyle={{ flex: 1 }}
                >
                  {ptiDistributionData ? (
                    <div style={{ height: '100%', minHeight: 160 }}>
                      <Bar
                        data={ptiDistributionData}
                        options={{
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                          },
                          scales: {
                            y: {
                              beginAtZero: true,
                              ticks: { precision: 0 },
                              title: {
                                display: true,
                                text: 'Số lượng đoạn (Segment)',
                              },
                            },
                          },
                        }}
                      />
                    </div>
                  ) : (
                    <EmptyState message="Không có dữ liệu phân phối" />
                  )}
                </Card>
              </div>
            </Col>

            <Col xs={24} md={12} style={{ display: 'flex' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  gap: 12,
                }}
              >
                <Card size="small" title="So sánh với KPI/Mục tiêu (Benchmark)">
                  <Space
                    direction="vertical"
                    size={4}
                    style={{ width: '100%' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <Text>PTI trung bình hành lang:</Text>
                      <Text strong>
                        {selectedCorridorAnalysis.ptiAvg.toFixed(2)}
                      </Text>
                    </div>
                    <Progress
                      percent={Math.min(
                        100,
                        (selectedCorridorAnalysis.ptiAvg / 3.0) * 100
                      )}
                      showInfo={false}
                      strokeColor={
                        selectedCorridorAnalysis.ptiAvg > TARGET_PTI_KPI
                          ? '#ff4d4f'
                          : '#52c41a'
                      }
                      trailColor="#f5f5f5"
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: 4,
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Mục tiêu: &lt; {TARGET_PTI_KPI}
                      </Text>
                      {selectedCorridorAnalysis.ptiAvg > TARGET_PTI_KPI ? (
                        <Text type="danger" style={{ fontSize: 12 }}>
                          Vượt ngưỡng cho phép
                        </Text>
                      ) : (
                        <Text type="success" style={{ fontSize: 12 }}>
                          Đạt tiêu chuẩn
                        </Text>
                      )}
                    </div>
                  </Space>
                </Card>

                {worstSegment && (
                  <Card size="small" title="Phân đoạn nghẽn (Bottleneck)">
                    <div
                      style={{
                        padding: '8px 12px',
                        background: '#fff1f0',
                        border: '1px solid #ffa39e',
                        borderRadius: 6,
                      }}
                    >
                      <Space direction="vertical" size={4}>
                        <Space>
                          <Tag color="red">Phân đoạn biến động nhất</Tag>
                        </Space>
                        <Text>
                          Đoạn <Text strong>{worstSegment.segmentName}</Text> có
                          chỉ số PTI cao nhất (
                          <Text strong type="danger">
                            {worstSegment.pti?.toFixed(2)}
                          </Text>
                          ), đóng góp đáng kể vào sự chậm trễ của toàn hành
                          lang.
                        </Text>
                      </Space>
                    </div>
                  </Card>
                )}

                <Card
                  size="small"
                  title="Danh sách segment"
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                  bodyStyle={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 0,
                  }}
                  extra={
                    <Select
                      style={{ width: 140 }}
                      value={segmentSortBy}
                      onChange={(value: ReliabilitySortBy) =>
                        setSegmentSortBy(value)
                      }
                      options={[
                        { label: 'Sort theo BI', value: 'buffer_index' },
                        { label: 'Sort theo PTI', value: 'pti' },
                      ]}
                    />
                  }
                >
                  <Table<CorridorReliabilityItem>
                    rowKey={(record, index) =>
                      `${record.segmentKey}-${record.corridorKey}-${record.timeWindow}-${record.periodEnd}-${index}`
                    }
                    columns={modalSegmentColumns}
                    dataSource={selectedCorridorSegments}
                    size="small"
                    pagination={{ pageSize: 5 }}
                    scroll={{ y: 180 }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    onRow={(record) => ({
                      onClick: () => toggleSegmentSelection(record),
                    })}
                    sortDirections={['descend', 'ascend']}
                  />
                </Card>
              </div>
            </Col>
          </Row>
        ) : (
          <EmptyState message="Chưa có dữ liệu cho corridor này" />
        )}
      </Modal>
    </div>
  )
}
