import { DoughnutChart } from '@/components/charts/ChartComponents'
import { ErrorState, Loading } from '@/components/common'
import IncidentImpactLayer from '@/components/map/IncidentImpactLayer'
import { IncidentLayer } from '@/components/map/IncidentLayer'
import { TrafficMap } from '@/components/map/TrafficMap'
import WeatherVoronoiLayer from '@/components/map/WeatherVoronoiLayer'
import { MapControls } from '@/components/widgets/MapControls'
import { MapLegend } from '@/components/widgets/MapLegend'
import {
  CHART_COLORS,
  LOS_COLORS,
  POLLING_INTERVALS,
  TRAFFIC_COLORS,
} from '@/config/constants'
import { useTrafficMap, useTrafficStatus } from '@/hooks/useTraffic'
import { mapApi } from '@/services/api'
import { useAppStore } from '@/stores/useAppStore'
import {
  GeoJSONFeature,
  IncidentCollection,
  IncidentFeature,
  IncidentImpactResponse,
  TrafficStatus,
} from '@/types'
import {
  AlertOutlined,
  ArrowsAltOutlined,
  BgColorsOutlined,
  ClockCircleOutlined,
  FireOutlined,
  ShrinkOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Col,
  Divider,
  List,
  Progress,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { TooltipItem } from 'chart.js'
import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import relativeTime from 'dayjs/plugin/relativeTime'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import CountUp from 'react-countup'
import { useLocation } from 'react-router-dom'

dayjs.extend(relativeTime)
dayjs.locale('vi')

type LosBucket = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'N/A'

type LosDistribution = Record<LosBucket, number>

const defaultLosDistribution = (): LosDistribution => ({
  A: 0,
  B: 0,
  C: 0,
  D: 0,
  E: 0,
  F: 0,
  'N/A': 0,
})

const losLabel: Record<LosBucket, string> = {
  A: 'LOS A • Thông thoáng',
  B: 'LOS B • Khá thông thoáng',
  C: 'LOS C • Trung bình',
  D: 'LOS D • Mật độ cao',
  E: 'LOS E • Đông xe',
  F: 'LOS F • Ùn tắc nghiêm trọng',
  'N/A': 'Chưa có dữ liệu',
}

const severityColor: Record<string, string> = {
  CRITICAL: 'red',
  HIGH: 'orange',
  MEDIUM: 'gold',
  LOW: 'blue',
}

const severityWeight: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }

  return null
}

const toLosBucket = (value: unknown): LosBucket => {
  const raw = String(value ?? '').toUpperCase()
  if (
    raw === 'A' ||
    raw === 'B' ||
    raw === 'C' ||
    raw === 'D' ||
    raw === 'E' ||
    raw === 'F'
  ) {
    return raw as LosBucket
  }
  return 'N/A'
}

const getSegmentCenter = (segment: GeoJSONFeature) => {
  const coords = segment.geometry.coordinates
  if (!coords || coords.length === 0) {
    return null
  }

  const centerIdx = Math.floor(coords.length / 2)
  const [lng, lat] = coords[centerIdx]
  return { lng, lat }
}

const renderCountUp = (
  value: number | null | undefined,
  options?: { decimals?: number }
) => {
  const numericValue = typeof value === 'number' ? value : NaN
  if (!Number.isFinite(numericValue)) {
    return '--'
  }

  const decimals = options?.decimals ?? 0

  return (
    <CountUp
      end={numericValue}
      duration={0.9}
      decimals={decimals}
      separator="."
      decimal=","
      preserveValue
    />
  )
}

export const DashboardPage: React.FC = () => {
  const segmentData = useTrafficMap()
  const trafficStatus = useTrafficStatus()
  const location = useLocation()
  const { error } = useAppStore()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)

  const [segmentStatusLayerEnabled, setSegmentStatusLayerEnabled] =
    useState(true)
  const [weatherLayerEnabled, setWeatherLayerEnabled] = useState(false)
  const [weatherLayerLoading, setWeatherLayerLoading] = useState(false)
  const [incidentLayerEnabled, setIncidentLayerEnabled] = useState(true)
  const [selectedIncident, setSelectedIncident] =
    useState<IncidentFeature | null>(null)
  const [mapFullscreen, setMapFullscreen] = useState(false)
  const lastHandledDeepLinkRef = useRef<string | null>(null)

  useEffect(() => {
    const contentEl = document.querySelector(
      '.ant-layout-content'
    ) as HTMLElement | null

    const prevContentOverflow = contentEl?.style.overflow
    const prevBodyOverflow = document.body.style.overflow

    if (contentEl) {
      contentEl.style.overflow = 'hidden'
    }
    document.body.style.overflow = 'hidden'

    return () => {
      if (contentEl) {
        contentEl.style.overflow = prevContentOverflow ?? ''
      }
      document.body.style.overflow = prevBodyOverflow
    }
  }, [])

  const { data: incidentData, isLoading: incidentsLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async (): Promise<IncidentCollection> => {
      const response = await mapApi.getIncidents('OPEN')

      if (response?.success && response?.data?.type === 'FeatureCollection') {
        return response.data
      }

      return { type: 'FeatureCollection', features: [] }
    },
    refetchInterval: 180000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  })

  const incidents = incidentData?.features || []

  const {
    data: impactResponse,
    isLoading: impactLoading,
    isError: impactError,
  } = useQuery({
    queryKey: ['incident-impact-propagation', selectedIncident?.properties?.id],
    queryFn: async (): Promise<IncidentImpactResponse | null> => {
      if (!selectedIncident?.properties?.id) return null

      const response = await mapApi.getIncidentImpactPropagation(
        selectedIncident.properties.id,
        {
          radiusMeters: 2000,
          ttiThreshold: 1.5,
          maxDepth: 4,
          maxSegments: 200,
        }
      )

      if (response?.success && response?.data) {
        return response.data
      }

      return null
    },
    enabled: incidentLayerEnabled && Boolean(selectedIncident?.properties?.id),
    refetchInterval: selectedIncident?.properties?.id
      ? POLLING_INTERVALS.TRAFFIC_DATA
      : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })

  const impactedSegments = impactResponse?.impactedSegments ?? []

  const derived = useMemo(() => {
    const features = segmentData?.features ?? []

    const statusBySegmentId = new Map<string, TrafficStatus>()
    for (const stat of trafficStatus ?? []) {
      if (!stat) continue
      statusBySegmentId.set(String(stat.segmentId), stat)
    }

    const losDist = defaultLosDistribution()
    const speedValues: number[] = []
    const jamSegments: GeoJSONFeature[] = []

    const corridorGroupMap = new Map<
      string,
      { label: string; speeds: number[]; segmentCount: number }
    >()
    const roadGroupMap = new Map<
      string,
      { label: string; speeds: number[]; segmentCount: number }
    >()

    let lastUpdated: string | null = null
    let corridorCount = 0
    let segmentStatusCount = 0

    for (const feature of features) {
      const segIdKey = String(feature?.properties?.segmentId)
      const stat = statusBySegmentId.get(segIdKey)

      if (stat) {
        segmentStatusCount += 1
      }

      const los = toLosBucket(stat?.losGrade ?? feature?.properties?.losIndex)
      losDist[los] += 1

      const speed = toFiniteNumber(
        stat?.avgSpeed ??
          stat?.currentSpeed ??
          (feature.properties as unknown as { avgSpeed?: unknown })?.avgSpeed
      )

      const isCorridor = Boolean(
        stat?.isCorridor ?? feature.properties?.isCorridor
      )

      if (isCorridor) {
        corridorCount += 1
      }

      const updatedRaw = stat?.timestamp ?? feature.properties?.lastUpdated
      const updatedIso = updatedRaw
        ? new Date(String(updatedRaw)).toISOString()
        : null

      if (updatedIso) {
        if (!lastUpdated) {
          lastUpdated = updatedIso
        } else if (
          new Date(updatedIso).getTime() > new Date(lastUpdated).getTime()
        ) {
          lastUpdated = updatedIso
        }
      }

      const enrichedFeature: GeoJSONFeature = {
        ...feature,
        properties: {
          ...feature.properties,
          ...(speed !== null ? { avgSpeed: speed } : {}),
          losIndex: los === 'N/A' ? 'N/A' : los,
          ...(updatedIso ? { lastUpdated: updatedIso } : {}),
          ...(isCorridor ? { isCorridor: true } : {}),
        },
      }

      if (speed !== null) {
        speedValues.push(speed)

        const roadKeyRaw = enrichedFeature.properties?.roadKey
        const roadKey =
          typeof roadKeyRaw === 'string' || typeof roadKeyRaw === 'number'
            ? String(roadKeyRaw)
            : null

        const label =
          (typeof enrichedFeature.properties?.roadName === 'string' &&
            enrichedFeature.properties.roadName.trim()) ||
          (typeof enrichedFeature.properties?.segmentName === 'string'
            ? enrichedFeature.properties.segmentName
            : 'Không tên')

        const groupKey = roadKey ? `road:${roadKey}` : `seg:${segIdKey}`

        const roadGroup = roadGroupMap.get(groupKey) ?? {
          label,
          speeds: [],
          segmentCount: 0,
        }
        roadGroup.speeds.push(speed)
        roadGroup.segmentCount += 1
        roadGroupMap.set(groupKey, roadGroup)

        if (isCorridor) {
          const corridorGroup = corridorGroupMap.get(groupKey) ?? {
            label,
            speeds: [],
            segmentCount: 0,
          }
          corridorGroup.speeds.push(speed)
          corridorGroup.segmentCount += 1
          corridorGroupMap.set(groupKey, corridorGroup)
        }
      }

      if (los === 'E' || los === 'F') {
        jamSegments.push(enrichedFeature)
      }
    }

    const avgSpeed = speedValues.length
      ? speedValues.reduce((acc, val) => acc + val, 0) / speedValues.length
      : null

    const pickTopSlowGroups = (
      source: Map<
        string,
        { label: string; speeds: number[]; segmentCount: number }
      >
    ) => {
      return [...source.values()]
        .map((g) => {
          const mean = g.speeds.length
            ? g.speeds.reduce((acc, v) => acc + v, 0) / g.speeds.length
            : NaN
          return {
            label: g.label,
            avgSpeed: mean,
            segmentCount: g.segmentCount,
          }
        })
        .filter((g) => Number.isFinite(g.avgSpeed) && g.segmentCount > 0)
        .sort((a, b) => a.avgSpeed - b.avgSpeed)
        .slice(0, 6)
    }

    const topSlowMode = corridorGroupMap.size > 0 ? 'corridor' : 'road'
    const topSlowGroups =
      corridorGroupMap.size > 0
        ? pickTopSlowGroups(corridorGroupMap)
        : pickTopSlowGroups(roadGroupMap)

    const severityCounts = incidents.reduce(
      (acc: Record<string, number>, incident) => {
        const sev = String(incident.properties?.severity ?? 'LOW')
        acc[sev] = (acc[sev] ?? 0) + 1
        return acc
      },
      { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>
    )

    const incidentScore = incidents.reduce((acc, incident) => {
      const sev = String(incident.properties?.severity ?? 'LOW')
      return acc + (severityWeight[sev] ?? 1)
    }, 0)

    return {
      avgSpeed,
      speedSampleCount: speedValues.length,
      segmentStatusCount,
      corridorCount,
      totalSegments: features.length,
      losDist,
      jamSegments,
      lastUpdated,
      topSlowGroups,
      topSlowMode,
      severityCounts,
      incidentScore,
    }
  }, [incidents, segmentData, trafficStatus])

  const handleSegmentClick = (segment: GeoJSONFeature, zoom = 16) => {
    if (!mapRef.current?.getMap) return

    const map = mapRef.current.getMap()
    const center = getSegmentCenter(segment)
    if (!center) return

    map.flyTo({
      center: [center.lng, center.lat],
      zoom,
      duration: 1000,
    })
  }

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

  useEffect(() => {
    if (!segmentData?.features?.length) {
      return
    }

    if (!location.search) {
      return
    }

    if (lastHandledDeepLinkRef.current === location.search) {
      return
    }

    const params = new URLSearchParams(location.search)
    const segmentId = params.get('segmentId')
    const roadKey = params.get('roadKey')

    if (segmentId) {
      const selectedFeature = segmentData.features.find(
        (feature: GeoJSONFeature) =>
          String(feature.properties.segmentId) === segmentId
      )

      if (selectedFeature) {
        handleSegmentClick(selectedFeature)
      }

      lastHandledDeepLinkRef.current = location.search
      return
    }

    if (roadKey) {
      const roadSegments = segmentData.features.filter(
        (feature: GeoJSONFeature) => feature.properties.roadKey === roadKey
      )

      if (roadSegments.length > 0) {
        const centers = roadSegments
          .map((segment) => ({
            segment,
            center: getSegmentCenter(segment),
          }))
          .filter(
            (
              item
            ): item is {
              segment: GeoJSONFeature
              center: { lng: number; lat: number }
            } => item.center !== null
          )

        if (centers.length > 0) {
          const centroid = centers.reduce(
            (acc, item) => ({
              lng: acc.lng + item.center.lng,
              lat: acc.lat + item.center.lat,
            }),
            { lng: 0, lat: 0 }
          )

          centroid.lng /= centers.length
          centroid.lat /= centers.length

          const representative = centers.reduce((best, current) => {
            const bestDistance =
              (best.center.lng - centroid.lng) ** 2 +
              (best.center.lat - centroid.lat) ** 2
            const currentDistance =
              (current.center.lng - centroid.lng) ** 2 +
              (current.center.lat - centroid.lat) ** 2
            return currentDistance < bestDistance ? current : best
          })

          handleSegmentClick(representative.segment, 15)
        }
      }

      lastHandledDeepLinkRef.current = location.search
      return
    }

    lastHandledDeepLinkRef.current = location.search
  }, [location.search, segmentData])

  const losDonutData = useMemo(() => {
    const buckets: LosBucket[] = ['A', 'B', 'C', 'D', 'E', 'F']

    return {
      labels: buckets.map((b) => losLabel[b]),
      datasets: [
        {
          label: 'Số đoạn',
          data: buckets.map((b) => derived.losDist[b] ?? 0),
          backgroundColor: [
            LOS_COLORS.A,
            LOS_COLORS.B,
            LOS_COLORS.C,
            LOS_COLORS.D,
            LOS_COLORS.E,
            LOS_COLORS.F,
          ],
          borderColor: 'rgba(255,255,255,0.9)',
          borderWidth: 2,
        },
      ],
    }
  }, [derived.losDist])

  const losDonutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right' as const,
          labels: {
            boxWidth: 10,
            padding: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx: { label?: string; parsed?: number }) => {
              const val = Number(ctx.parsed ?? 0)
              return `${ctx.label ?? ''}: ${val.toLocaleString('vi-VN')}`
            },
          },
        },
      },
      cutout: '62%',
    }),
    []
  )

  const topSlowBar = useMemo(() => {
    const items = derived.topSlowGroups
    const labels = items.map((g) => {
      const name = String(g.label ?? '')
      return name.length > 26 ? `${name.slice(0, 26)}…` : name
    })

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Vận tốc TB (km/h) — thấp hơn là kẹt hơn',
            data: items.map((g) => Number(g.avgSpeed ?? 0)),
            backgroundColor: 'rgba(255, 77, 79, 0.55)',
            borderColor: CHART_COLORS.error,
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y' as const,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (tooltipItem: TooltipItem<'bar'>) => {
                const parsed = tooltipItem.parsed as unknown as
                  | { x?: number | null }
                  | undefined
                const val = Number(parsed?.x ?? 0)
                const idx = tooltipItem.dataIndex
                const segCount = items[idx]?.segmentCount
                return segCount
                  ? `${val.toFixed(1)} km/h • ${segCount} đoạn`
                  : `${val.toFixed(1)} km/h`
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: {
              color: 'rgba(148,163,184,0.2)',
            },
            ticks: {
              maxTicksLimit: 6,
            },
          },
          y: {
            grid: {
              display: false,
            },
          },
        },
      },
    }
  }, [derived.topSlowGroups])

  const headerKpis = (
    <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" style={{ borderRadius: 12 }}>
          <Space
            align="start"
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(0,0,0,0.55)',
                  fontWeight: 600,
                }}
              >
                Vận tốc trung bình
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: CHART_COLORS.primary,
                }}
              >
                {renderCountUp(derived.avgSpeed, { decimals: 1 })}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    marginLeft: 6,
                    color: 'rgba(0,0,0,0.45)',
                  }}
                >
                  km/h
                </span>
              </div>
            </div>
            <div style={{ fontSize: 20, opacity: 0.85 }}>🚗</div>
          </Space>
          <div
            style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}
          >
            {derived.lastUpdated
              ? `Cập nhật ${dayjs(derived.lastUpdated).fromNow()}`
              : derived.segmentStatusCount > 0
                ? 'Đang đồng bộ dữ liệu...'
                : 'Chưa có dữ liệu realtime từ /map/status'}
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card size="small" style={{ borderRadius: 12 }}>
          <Space
            align="start"
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(0,0,0,0.55)',
                  fontWeight: 600,
                }}
              >
                Điểm ùn tắc (LOS E/F)
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: TRAFFIC_COLORS.VERY_HIGH,
                }}
              >
                {renderCountUp(derived.jamSegments.length)}
              </div>
            </div>
            <div style={{ fontSize: 20, opacity: 0.85 }}>🚦</div>
          </Space>
          <div
            style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}
          >
            Ưu tiên xử lý các đoạn LOS F
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card size="small" style={{ borderRadius: 12 }}>
          <Space
            align="start"
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(0,0,0,0.55)',
                  fontWeight: 600,
                }}
              >
                Sự cố đang mở
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: CHART_COLORS.error,
                }}
              >
                {renderCountUp(incidents.length)}
              </div>
            </div>
            <AlertOutlined
              style={{ fontSize: 20, color: CHART_COLORS.error }}
            />
          </Space>
          <div
            style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}
          >
            Điểm ưu tiên: {renderCountUp(derived.incidentScore)}
          </div>
        </Card>
      </Col>

      <Col xs={24} sm={12} lg={6}>
        <Card size="small" style={{ borderRadius: 12 }}>
          <Space
            align="start"
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(0,0,0,0.55)',
                  fontWeight: 600,
                }}
              >
                Đoạn đang giám sát
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: 'rgba(0,0,0,0.85)',
                }}
              >
                {renderCountUp(derived.totalSegments)}
              </div>
            </div>
            <WarningOutlined
              style={{ fontSize: 20, color: 'rgba(0,0,0,0.45)' }}
            />
          </Space>
          <div
            style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}
          >
            Hành lang ưu tiên: {renderCountUp(derived.corridorCount)}
          </div>
        </Card>
      </Col>
    </Row>
  )

  const incidentPanel = (
    <Card
      size="small"
      style={{ borderRadius: 12, height: '100%' }}
      title={
        <Space size={10}>
          <FireOutlined />
          <span style={{ fontWeight: 700 }}>Tóm tắt sự cố</span>
          <Badge count={incidents.length} showZero />
        </Space>
      }
      bodyStyle={{
        paddingTop: 10,
        height: 'calc(100% - 48px)',
        overflow: 'hidden',
      }}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
              Mức độ nghiêm trọng
            </span>
            <Tooltip title="Điểm ưu tiên = tổng trọng số theo mức độ (CRITICAL>HIGH>MEDIUM>LOW).">
              <span
                style={{
                  fontSize: 12,
                  color: 'rgba(0,0,0,0.55)',
                  cursor: 'help',
                }}
              >
                <ClockCircleOutlined /> Ưu tiên
              </span>
            </Tooltip>
          </div>
          <Divider style={{ margin: '8px 0 10px' }} />
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
              <div
                key={sev}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr 40px',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <Tag
                  color={severityColor[sev]}
                  style={{ margin: 0, textAlign: 'center', fontWeight: 700 }}
                >
                  {sev}
                </Tag>
                <Progress
                  percent={
                    incidents.length
                      ? Math.round(
                          ((derived.severityCounts[sev] ?? 0) /
                            incidents.length) *
                            100
                        )
                      : 0
                  }
                  showInfo={false}
                  size="small"
                  strokeColor={
                    sev === 'CRITICAL'
                      ? CHART_COLORS.error
                      : sev === 'HIGH'
                        ? TRAFFIC_COLORS.VERY_HIGH
                        : sev === 'MEDIUM'
                          ? CHART_COLORS.warning
                          : CHART_COLORS.primary
                  }
                />
                <span
                  style={{
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {(derived.severityCounts[sev] ?? 0).toLocaleString('vi-VN')}
                </span>
              </div>
            ))}
          </Space>
        </div>

        <Divider style={{ margin: '4px 0 2px' }} />

        <div style={{ minHeight: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: 'rgba(0,0,0,0.55)',
                fontWeight: 600,
              }}
            >
              Danh sách sự cố (mới nhất)
            </div>
            <Tag
              color={incidentLayerEnabled ? 'green' : 'default'}
              style={{ margin: 0 }}
            >
              {incidentLayerEnabled
                ? 'Đang hiển thị trên bản đồ'
                : 'Ẩn trên bản đồ'}
            </Tag>
          </div>

          <div style={{ marginTop: 8, maxHeight: 320, overflow: 'auto' }}>
            <List
              size="small"
              dataSource={[...incidents]
                .sort(
                  (a, b) =>
                    new Date(b.properties.timestamp).getTime() -
                    new Date(a.properties.timestamp).getTime()
                )
                .slice(0, 10)}
              loading={incidentsLoading}
              renderItem={(incident) => {
                const { id, severity, title, timestamp, type } =
                  incident.properties
                return (
                  <List.Item
                    key={id}
                    style={{
                      cursor: 'pointer',
                      paddingLeft: 6,
                      paddingRight: 6,
                    }}
                    onClick={() => {
                      setSelectedIncident(incident)
                      const [lng, lat] = incident.geometry.coordinates
                      const mapObj = mapRef.current as {
                        getMap?: () => {
                          flyTo: (opts: {
                            center: [number, number]
                            zoom: number
                            duration: number
                          }) => void
                        }
                      } | null
                      if (mapObj?.getMap) {
                        mapObj.getMap().flyTo({
                          center: [lng, lat],
                          zoom: 16,
                          duration: 900,
                        })
                      }
                    }}
                  >
                    <List.Item.Meta
                      title={
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: 12,
                              lineHeight: 1.2,
                            }}
                          >
                            {title}
                          </span>
                          <Tag
                            color={severityColor[String(severity)] ?? 'default'}
                            style={{ margin: 0, fontWeight: 700 }}
                          >
                            {severity}
                          </Tag>
                        </div>
                      }
                      description={
                        <div
                          style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}
                        >
                          {type} • {dayjs(timestamp).fromNow()}
                        </div>
                      }
                    />
                  </List.Item>
                )
              }}
            />
          </div>
        </div>
      </Space>
    </Card>
  )

  const mapPanel = (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <TrafficMap
        segmentData={segmentData}
        style={{ height: '100%', width: '100%' }}
        mapRef={mapRef}
        segmentStatusLayerEnabled={segmentStatusLayerEnabled}
      >
        {weatherLayerEnabled && (
          <WeatherVoronoiLayer
            visible={weatherLayerEnabled}
            mapRef={mapRef}
            onLoadingChange={setWeatherLayerLoading}
          />
        )}

        {incidentLayerEnabled && (
          <IncidentLayer
            incidents={incidents}
            isLoading={incidentsLoading}
            onIncidentClick={setSelectedIncident}
            mapRef={mapRef}
            selectedIncident={selectedIncident}
            onSelectedIncidentChange={setSelectedIncident}
          />
        )}

        <IncidentImpactLayer
          visible={
            incidentLayerEnabled &&
            Boolean(selectedIncident) &&
            impactedSegments.length > 0
          }
          segments={impactedSegments}
          mapRef={mapRef}
        />
      </TrafficMap>

      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 30,
          display: 'flex',
          gap: 8,
        }}
      >
        <Tooltip
          title={mapFullscreen ? 'Thu nhỏ bản đồ' : 'Mở bản đồ toàn màn hình'}
        >
          <Button
            icon={mapFullscreen ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
            onClick={() => setMapFullscreen((prev) => !prev)}
          >
            {mapFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          </Button>
        </Tooltip>
      </div>

      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onCompass={handleCompassReset}
        onSegmentStatusToggle={setSegmentStatusLayerEnabled}
        onWeatherToggle={setWeatherLayerEnabled}
        onIncidentToggle={(enabled) => {
          setIncidentLayerEnabled(enabled)
          if (!enabled) {
            setSelectedIncident(null)
          }
        }}
        showCamera={false}
        showRouting={false}
        defaultSegmentStatusLayerEnabled={segmentStatusLayerEnabled}
        defaultWeatherLayerEnabled={weatherLayerEnabled}
        defaultIncidentLayerEnabled={incidentLayerEnabled}
      />

      {mapFullscreen && <MapLegend />}

      {weatherLayerEnabled && weatherLayerLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.18)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#F8FAFC',
              fontSize: 13,
              fontWeight: 600,
              padding: '10px 14px',
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.62)',
              border: '1px solid rgba(248, 250, 252, 0.18)',
              boxShadow: '0 10px 24px rgba(2, 6, 23, 0.25)',
            }}
          >
            Đang tải lớp thời tiết...
          </div>
        </div>
      )}

      {incidentLayerEnabled && selectedIncident && (
        <div
          style={{
            position: 'absolute',
            bottom: 84,
            left: 12,
            zIndex: 26,
            pointerEvents: 'none',
            minWidth: 280,
            maxWidth: 420,
          }}
        >
          <div
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'rgba(15, 23, 42, 0.78)',
              color: '#F8FAFC',
              padding: '12px 14px',
              boxShadow: '0 12px 28px rgba(2,6,23,0.28)',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                Vết loang kẹt xe
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#CBD5E1',
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 0,
                }}
                title="Tắt vết loang"
              >
                ×
              </button>
            </div>

            {impactLoading && (
              <div style={{ fontSize: 12, color: '#CBD5E1' }}>
                Đang phân tích vùng ảnh hưởng...
              </div>
            )}

            {!impactLoading && impactError && (
              <div style={{ fontSize: 12, color: '#FECACA' }}>
                Không lấy được dữ liệu vết loang. Vui lòng thử lại.
              </div>
            )}

            {!impactLoading &&
              !impactError &&
              impactedSegments.length === 0 && (
                <div style={{ fontSize: 12, color: '#E2E8F0' }}>
                  Chưa ghi nhận vết loang đáng kể trong bán kính hiện tại.
                </div>
              )}

            {!impactLoading &&
              !impactError &&
              impactedSegments.length > 0 &&
              impactResponse && (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '8px 10px',
                      fontSize: 12,
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      Đoạn đường:{' '}
                      <b>{impactResponse.summary.totalImpactedSegments}</b>
                    </div>
                    <div>
                      Chiều dài:{' '}
                      <b>
                        {impactResponse.summary.impactedLengthKm.toFixed(2)} km
                      </b>
                    </div>
                    <div>
                      Hàng đợi xa nhất:{' '}
                      <b>
                        {impactResponse.summary.maxQueueDistanceKm.toFixed(2)}{' '}
                        km
                      </b>
                    </div>
                    <div>
                      Mức độ: <b>{impactResponse.summary.severityScore}</b>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: '#CBD5E1' }}>
                    Legend: <span style={{ color: '#FB7185' }}>CRITICAL</span> /{' '}
                    <span style={{ color: '#F97316' }}>HIGH</span> /{' '}
                    <span style={{ color: '#FB923C' }}>MEDIUM</span> /{' '}
                    <span style={{ color: '#F59E0B' }}>LOW</span>
                  </div>
                </>
              )}
          </div>
        </div>
      )}
    </div>
  )

  if (!segmentData || segmentData.features.length === 0) {
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

  if (mapFullscreen) {
    return (
      <div
        style={{
          height: '100vh',
          width: '100%',
          padding: 12,
          boxSizing: 'border-box',
          background: '#f0f2f5',
        }}
      >
        <Card
          style={{ height: '100%', borderRadius: 12 }}
          bodyStyle={{ height: '100%', padding: 0 }}
        >
          {mapPanel}
        </Card>
      </div>
    )
  }

  return (
    <div
      style={{
        height: '100vh',
        width: '100%',
        padding: 12,
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Dashboard Giám sát giao thông
        </Typography.Title>
        <Typography.Text type="secondary">
          Góc nhìn vận hành cho cán bộ Sở GTVT (thời gian thực)
        </Typography.Text>
      </div>

      {headerKpis}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1fr) minmax(0, 320px)',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 0.9fr)',
            gap: 12,
            minHeight: 0,
          }}
        >
          <Card
            style={{ borderRadius: 12, overflow: 'hidden' }}
            bodyStyle={{ padding: 0, height: '100%' }}
          >
            {mapPanel}
          </Card>

          <div style={{ minHeight: 0 }}>{incidentPanel}</div>
        </div>

        <div style={{ minHeight: 0 }}>
          <Row gutter={[12, 12]} style={{ height: '100%' }}>
            <Col xs={24} lg={10} style={{ height: '100%' }}>
              <Card
                size="small"
                style={{ borderRadius: 12, height: '100%' }}
                title={
                  <Space size={10}>
                    <BgColorsOutlined />
                    <span style={{ fontWeight: 700 }}>
                      Phân bố mức độ ùn tắc (LOS)
                    </span>
                  </Space>
                }
                extra={
                  <Tag
                    color={derived.segmentStatusCount > 0 ? 'green' : 'default'}
                    style={{ margin: 0 }}
                  >
                    Realtime:{' '}
                    {derived.segmentStatusCount.toLocaleString('vi-VN')}/
                    {derived.totalSegments.toLocaleString('vi-VN')}
                  </Tag>
                }
                bodyStyle={{ height: 'calc(100% - 48px)' }}
              >
                {derived.segmentStatusCount === 0 ? (
                  <div style={{ padding: 12, color: 'rgba(0,0,0,0.45)' }}>
                    Chưa có dữ liệu realtime (LOS) từ /map/status.
                  </div>
                ) : (
                  <div style={{ height: '100%', minHeight: 220 }}>
                    <DoughnutChart
                      data={losDonutData}
                      options={losDonutOptions}
                    />
                  </div>
                )}
              </Card>
            </Col>

            <Col xs={24} lg={14} style={{ height: '100%' }}>
              <Row gutter={[12, 12]} style={{ height: '100%' }}>
                <Col xs={24} md={12} style={{ height: '100%' }}>
                  <Card
                    size="small"
                    style={{ borderRadius: 12, height: '100%' }}
                    title={
                      <Space size={10}>
                        <WarningOutlined />
                        <span style={{ fontWeight: 700 }}>Top tuyến chậm</span>
                      </Space>
                    }
                    extra={
                      <Tooltip
                        title={
                          derived.topSlowMode === 'corridor'
                            ? 'Top 6 hành lang ưu tiên chậm nhất (gom theo roadKey/roadName, chỉ tính các đoạn thuộc hành lang/corridor).'
                            : 'Top 6 tuyến chậm nhất (gom theo roadKey/roadName).'
                        }
                      >
                        <Tag
                          color="default"
                          style={{ margin: 0, cursor: 'help' }}
                        >
                          {derived.topSlowMode === 'corridor'
                            ? '6 hành lang'
                            : '6 tuyến'}
                        </Tag>
                      </Tooltip>
                    }
                    bodyStyle={{ height: 'calc(100% - 48px)' }}
                  >
                    {derived.speedSampleCount === 0 ? (
                      <div style={{ padding: 12, color: 'rgba(0,0,0,0.45)' }}>
                        Chưa có dữ liệu vận tốc realtime để xếp hạng.
                      </div>
                    ) : (
                      <div style={{ height: '100%', minHeight: 220 }}>
                        <Bar
                          data={topSlowBar.data}
                          options={topSlowBar.options}
                        />
                      </div>
                    )}
                  </Card>
                </Col>

                <Col xs={24} md={12} style={{ height: '100%' }}>
                  <Card
                    size="small"
                    style={{ borderRadius: 12, height: '100%' }}
                    title={
                      <Space size={10}>
                        <AlertOutlined />
                        <span style={{ fontWeight: 700 }}>
                          Điểm nóng (LOS E/F)
                        </span>
                      </Space>
                    }
                    extra={
                      <Tooltip title="Click để zoom vào bản đồ.">
                        <Tag
                          color="default"
                          style={{ margin: 0, cursor: 'help' }}
                        >
                          Tương tác
                        </Tag>
                      </Tooltip>
                    }
                    bodyStyle={{
                      height: 'calc(100% - 48px)',
                      overflow: 'auto',
                    }}
                  >
                    {derived.jamSegments.length === 0 ? (
                      <div style={{ padding: 12, color: 'rgba(0,0,0,0.45)' }}>
                        Chưa ghi nhận đoạn LOS E/F.
                      </div>
                    ) : (
                      <List
                        size="small"
                        dataSource={[...derived.jamSegments]
                          .sort((a, b) => {
                            const sa = Number(a.properties.avgSpeed ?? 999)
                            const sb = Number(b.properties.avgSpeed ?? 999)
                            return sa - sb
                          })
                          .slice(0, 10)}
                        renderItem={(segment) => {
                          const los = String(
                            segment.properties.losIndex ?? 'N/A'
                          ).toUpperCase()
                          const losColor =
                            los === 'F'
                              ? TRAFFIC_COLORS.EXTREME
                              : los === 'E'
                                ? TRAFFIC_COLORS.VERY_HIGH
                                : 'rgba(0,0,0,0.25)'

                          return (
                            <List.Item
                              key={segment.properties.segmentId}
                              style={{
                                cursor: 'pointer',
                                paddingLeft: 6,
                                paddingRight: 6,
                              }}
                              onClick={() => handleSegmentClick(segment)}
                            >
                              <List.Item.Meta
                                title={
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      gap: 10,
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontWeight: 600,
                                        fontSize: 12,
                                        lineHeight: 1.2,
                                      }}
                                    >
                                      {segment.properties.segmentName}
                                    </span>
                                    <Tag
                                      color={los === 'F' ? 'red' : 'volcano'}
                                      style={{ margin: 0 }}
                                    >
                                      LOS {los}
                                    </Tag>
                                  </div>
                                }
                                description={
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      gap: 10,
                                      fontSize: 11,
                                      color: 'rgba(0,0,0,0.45)',
                                    }}
                                  >
                                    <span>
                                      Vận tốc:{' '}
                                      {Number(
                                        segment.properties.avgSpeed ?? 0
                                      ).toFixed(1)}{' '}
                                      km/h
                                    </span>
                                    <span
                                      style={{
                                        color: losColor,
                                        fontWeight: 700,
                                      }}
                                    >
                                      {los === 'F'
                                        ? 'Nguy cơ tê liệt'
                                        : 'Cần theo dõi'}
                                    </span>
                                  </div>
                                }
                              />
                            </List.Item>
                          )
                        }}
                      />
                    )}
                  </Card>
                </Col>
              </Row>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  )
}
