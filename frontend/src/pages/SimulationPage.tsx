import { ExperimentOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Row,
  Space,
  Spin,
  Typography,
  message,
  Switch,
  Alert,
  Tabs,
  Tag,
  Radio,
  Select,
  Modal,
} from 'antd'
import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart } from '@/components/charts/ChartComponents'
import { PredictiveMap } from '@/components/map/PredictiveMap'
import { SelectionMap } from '@/components/map/SelectionMap'
import { useTrafficStatus } from '@/hooks/useTraffic'
import { mapApi, predictionApi, simulationApi } from '@/services/api'
import type { PredictionItem } from '@/types'
import dayjs from 'dayjs'

const { Text } = Typography

const TICKER_HEIGHT = 40
const FORECAST_SUPPORTED_HORIZON = 15
const FORECAST_WINDOW_START_MINUTE = 9 * 60 + 15
const FORECAST_WINDOW_END_MINUTE = 21 * 60 + 15
const FREE_FLOW_SPEED_KMH = 55
const CONGESTION_SPEED_KMH: Record<number, number> = {
  0: 55,
  1: 48,
  2: 38,
  3: 28,
  4: 18,
  5: 10,
}
const CONGESTION_LABELS = [
  'Thông thoáng',
  'Ổn định',
  'Đông',
  'Chậm',
  'Ùn tắc',
  'Nghiêm trọng',
]

const formatMinutes = (seconds?: number) => ((seconds ?? 0) / 60).toFixed(1)
const formatDelta = (value: number, unit: string) => {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}${unit}`
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const average = (values: number[]) => {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const congestionLabel = (level: number) => {
  const rounded = Math.max(0, Math.min(5, Math.round(level)))
  return CONGESTION_LABELS[rounded] || 'Không rõ'
}

const haversineKm = (from: [number, number], to: [number, number]) => {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const radiusKm = 6371
  const dLat = toRad(to[1] - from[1])
  const dLng = toRad(to[0] - from[0])
  const lat1 = toRad(from[1])
  const lat2 = toRad(to[1])
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const isCoordinate = (value: unknown): value is [number, number] => {
  if (!Array.isArray(value) || value.length < 2) return false
  return Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
}

const lineLengthKm = (coordinates: unknown): number => {
  if (!Array.isArray(coordinates)) return 0
  if (coordinates.every(isCoordinate)) {
    return coordinates.reduce((sum, coordinate, index) => {
      if (index === 0) return sum
      return sum + haversineKm(coordinates[index - 1], coordinate)
    }, 0)
  }
  return coordinates.reduce((sum, item) => sum + lineLengthKm(item), 0)
}

type RoadOperationStats = {
  avgSpeed: number
  avgCongestion: number
  travelTimeMinutes: number
  tti: number
  lengthKm: number
}

const emptyStats: RoadOperationStats = {
  avgSpeed: 0,
  avgCongestion: 0,
  travelTimeMinutes: 0,
  tti: 0,
  lengthKm: 0,
}

type RoadInfo = {
  roadName: string
  roadKey?: string
  segmentCount: number
  segmentIds: string[]
  forecastSegmentIds?: string[]
  center?: [number, number]
  geojson?: any
}

const uniqueSegmentIds = (segmentIds: unknown[]) => {
  return Array.from(
    new Set(
      segmentIds
        .map((segmentId) => String(segmentId ?? '').trim())
        .filter((segmentId) => /^\d+$/.test(segmentId))
    )
  )
}

const getForecastSegmentIds = (geojson: any) => {
  const features = Array.isArray(geojson?.features) ? geojson.features : []
  const hasTrafficFlowMetadata = features.some(
    (feature: any) => typeof feature?.properties?.hasTrafficFlow === 'boolean'
  )

  if (hasTrafficFlowMetadata) {
    return uniqueSegmentIds(
      features
        .filter((feature: any) => feature?.properties?.hasTrafficFlow === true)
        .map((feature: any) => feature?.properties?.segmentId)
    )
  }

  return uniqueSegmentIds(features.map((feature: any) => feature?.properties?.segmentId))
}

type ForecastStatsCardProps = {
  title: string
  stats: RoadOperationStats
  comparison?: RoadOperationStats
  tone?: 'baseline' | 'forecast'
}

const ForecastStatsCard: React.FC<ForecastStatsCardProps> = ({
  title,
  stats,
  comparison,
  tone = 'baseline',
}) => {
  const speedDelta = comparison ? stats.avgSpeed - comparison.avgSpeed : 0
  const timeDelta = comparison ? stats.travelTimeMinutes - comparison.travelTimeMinutes : 0
  const ttiDelta = comparison ? stats.tti - comparison.tti : 0
  const accent = tone === 'forecast' ? '#722ed1' : '#334155'

  return (
    <Card
      size="small"
      bodyStyle={{ padding: '8px 10px' }}
      style={{
        width: 286,
        background: 'rgba(255,255,255,0.94)',
        border: `1px solid ${tone === 'forecast' ? '#d3adf7' : '#e2e8f0'}`,
        boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
      }}
    >
      <div style={{ fontSize: 10, color: accent, textTransform: 'uppercase', fontWeight: 800, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: '#64748b' }}>Vận tốc TB</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: accent }}>
            {stats.avgSpeed > 0 ? stats.avgSpeed.toFixed(1) : '--'} km/h
          </div>
          {comparison && (
            <Text type={speedDelta < 0 ? 'danger' : 'success'} style={{ fontSize: 11, fontWeight: 700 }}>
              {formatDelta(speedDelta, '')} km/h
            </Text>
          )}
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#64748b' }}>Thời gian</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: accent }}>
            {stats.travelTimeMinutes > 0 ? stats.travelTimeMinutes.toFixed(1) : '--'} p
          </div>
          {comparison && (
            <Text type={timeDelta > 0 ? 'danger' : 'success'} style={{ fontSize: 11, fontWeight: 700 }}>
              {formatDelta(timeDelta, 'p')}
            </Text>
          )}
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#64748b' }}>TTI</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
            {stats.tti > 0 ? stats.tti.toFixed(2) : '--'}
            {comparison && (
              <Text type={ttiDelta > 0 ? 'danger' : 'success'} style={{ marginLeft: 6, fontSize: 11, fontWeight: 700 }}>
                {formatDelta(ttiDelta, '')}
              </Text>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#64748b' }}>Mức kẹt xe</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
            {congestionLabel(stats.avgCongestion)}
          </div>
        </div>
      </div>
    </Card>
  )
}

export const SimulationPage: React.FC = () => {
  const navigate = useNavigate()
  const trafficStatus = useTrafficStatus()

  const [blockedSegmentIds, setBlockedSegmentIds] = useState<string[]>([])
  const [visualBlockedIds, setVisualBlockedIds] = useState<string[]>([])
  const [simulationStart, setSimulationStart] = useState<[number, number] | null>(null)
  const [simulationEnd, setSimulationEnd] = useState<[number, number] | null>(null)
  const [closureMode, setClosureMode] = useState(false)
  const [baselineRoute, setBaselineRoute] = useState<any | null>(null)
  const [simulatedRoute, setSimulatedRoute] = useState<any | null>(null)
  const [simulationStats, setSimulationStats] = useState<{
    distance: number
    time: number
    originalDistance?: number
    originalTime?: number
  } | null>(null)
  const [simulationRouteError, setSimulationRouteError] = useState<string | null>(null)

  const [selectedRoad, setSelectedRoad] = useState<RoadInfo | null>(null)
  const [predictionData, setPredictionData] = useState<PredictionItem[]>([])
  const [forecastLoading, setForecastLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'real-time' | 'forecast' | 'simulation'>('real-time')
  const [mapResetVersion, setMapResetVersion] = useState(0)
  const [horizon, setHorizon] = useState(FORECAST_SUPPORTED_HORIZON)
  const [roadsList, setRoadsList] = useState<Array<{ label: string, value: string }>>([])
  const previousBlockedKeyRef = useRef(blockedSegmentIds.join('|'))
  const previousRoutePointsKeyRef = useRef('')
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accessWindowModalShownRef = useRef(false)

  useEffect(() => {
    if (accessWindowModalShownRef.current) return

    const now = dayjs()
    const minuteOfDay = now.hour() * 60 + now.minute()
    const isInForecastWindow =
      minuteOfDay >= FORECAST_WINDOW_START_MINUTE &&
      minuteOfDay <= FORECAST_WINDOW_END_MINUTE

    if (isInForecastWindow) return

    accessWindowModalShownRef.current = true
    Modal.info({
      title: 'Thông báo',
      content: 'Vui lòng quay lại sau 09h15',
      okText: 'OK',
      onOk: () => {
        if (window.history.length > 1) {
          navigate(-1)
        } else {
          navigate('/real-time', { replace: true })
        }
      },
    })
  }, [navigate])

  const clearSimulationResults = useCallback(() => {
    setBaselineRoute(null)
    setSimulatedRoute(null)
    setSimulationStats(null)
    setVisualBlockedIds([])
    setSimulationRouteError(null)
  }, [])

  useEffect(() => {
    const fetchRoads = async () => {
      try {
        const response = await mapApi.getRoads()
        if (response.success && response.data) {
          setRoadsList(response.data.map(r => ({
            label: r.roadName,
            value: r.roadKey
          })))
        }
      } catch (err) {
        console.error('Failed to fetch roads list', err)
      }
    }
    fetchRoads()
  }, [])
  const baselineForecastStats = useMemo<RoadOperationStats>(() => {
    const features = selectedRoad?.geojson?.features || []
    const speeds = features
      .map((feature: any) => toNumber(feature.properties?.speed))
      .filter((value: number | null): value is number => value !== null && value > 0)
    const congestionLevels = features
      .map((feature: any) => toNumber(feature.properties?.losNumeric))
      .filter((value: number | null): value is number => value !== null)
    const lengthKm = features.reduce(
      (sum: number, feature: any) => sum + lineLengthKm(feature.geometry?.coordinates),
      0
    )
    const avgSpeed = average(speeds)
    const avgCongestion = average(congestionLevels)
    const safeLength = lengthKm > 0 ? lengthKm : 0
    const travelTimeMinutes = avgSpeed > 0 ? (safeLength / avgSpeed) * 60 : 0

    return {
      avgSpeed,
      avgCongestion,
      travelTimeMinutes,
      tti: avgSpeed > 0 ? FREE_FLOW_SPEED_KMH / avgSpeed : 0,
      lengthKm: safeLength,
    }
  }, [selectedRoad?.geojson])
  const predictedForecastStats = useMemo<RoadOperationStats>(() => {
    if (predictionData.length === 0) return emptyStats

    const predictedLevels = predictionData
      .map((item) => toNumber(item.congestion_level))
      .filter((value: number | null): value is number => value !== null)
    const predictedSpeeds = predictedLevels.map(
      (level) => CONGESTION_SPEED_KMH[Math.max(0, Math.min(5, Math.round(level)))] ?? 25
    )
    const avgSpeed = average(predictedSpeeds)
    const avgCongestion = average(predictedLevels)
    const lengthKm = baselineForecastStats.lengthKm
    const travelTimeMinutes = avgSpeed > 0 ? (lengthKm / avgSpeed) * 60 : 0

    return {
      avgSpeed,
      avgCongestion,
      travelTimeMinutes,
      tti: avgSpeed > 0 ? FREE_FLOW_SPEED_KMH / avgSpeed : 0,
      lengthKm,
    }
  }, [baselineForecastStats.lengthKm, predictionData])

  // Fetch full road data (GeoJSON + segments) when a road is selected
  React.useEffect(() => {
    const fetchFullRoad = async () => {
      if (selectedRoad?.roadKey && !selectedRoad.geojson) {
        try {
          const response = await mapApi.getRoadGeoJson(selectedRoad.roadKey)
          if (response.success && response.data) {
            const geojson = response.data
            const segmentIds = uniqueSegmentIds(
              (geojson.features || []).map((f: any) => f.properties.segmentId)
            )
            const forecastSegmentIds = getForecastSegmentIds(geojson)
            setSelectedRoad(prev => prev ? ({
              ...prev,
              segmentIds,
              forecastSegmentIds,
              segmentCount: segmentIds.length,
              geojson
            }) : null)
          }
        } catch (e) {
          console.error('Failed to fetch road GeoJSON', e)
        }
      }
    }
    fetchFullRoad()
  }, [selectedRoad?.roadKey])

  const handleToggleBlock = (segmentIds: any[]) => {
    setBlockedSegmentIds(prev => {
      let next = [...prev]
      segmentIds.forEach(id => {
        const idStr = String(id)
        if (next.includes(idStr)) {
          next = next.filter(i => i !== idStr)
        } else {
          next.push(idStr)
        }
      })
      return next
    })
    setVisualBlockedIds([])
  }

  const runSimulation = useCallback(async (
    blockedIds: string[],
    options: { silent?: boolean } = {}
  ) => {
    if (!simulationStart || !simulationEnd) {
      if (!options.silent) {
        message.warning('Vui lòng chọn điểm Gốc và điểm Đích trên bản đồ.')
      }
      return
    }

    const normalizedBlockedIds = blockedIds.map(String)
    setForecastLoading(true)
    setPredictionData([])
    if (viewMode !== 'simulation') {
      clearSimulationResults()
    }

    try {
      const response = await simulationApi.runRouting(
        simulationStart,
        simulationEnd,
        normalizedBlockedIds
      )

      if (response.success && response.data) {
        const expandedBlockedSegments = response.data.expandedBlockedSegments?.length
          ? response.data.expandedBlockedSegments
          : normalizedBlockedIds

        setBaselineRoute(response.data.baseline.route)
        setVisualBlockedIds(expandedBlockedSegments)
        setViewMode('simulation')

        if (response.data.rerouteAvailable === false) {
          const reason = response.data.rerouteFailureReason || 'Không tìm thấy tuyến thay thế khả dụng.'
          setSimulatedRoute(null)
          setSimulationStats({
            distance: 0,
            time: 0,
            originalDistance: response.data.baseline.distance,
            originalTime: response.data.baseline.duration
          })
          setSimulationRouteError(reason)
          if (!options.silent) {
            message.warning(reason)
          }
          return
        }

        setSimulationRouteError(null)
        setSimulatedRoute(response.data.rerouted.route)
        setSimulationStats({
          distance: response.data.rerouted.distance,
          time: response.data.rerouted.duration,
          originalDistance: response.data.baseline.distance,
          originalTime: response.data.baseline.duration
        })
        if (!options.silent) {
          if (response.data.blockedRouteSegments?.length) {
            message.warning('Lộ trình vẫn còn giao với đoạn bị đóng. Vui lòng chọn thêm đoạn gần đó hoặc đổi điểm O-D.')
          } else {
            message.success('Đã tính toán xong lộ trình giả lập!')
          }
        }
      }
    } catch (error) {
      if (!options.silent) {
        message.error('Lỗi khi chạy giả lập: ' + (error as Error).message)
      } else {
        console.error('Lỗi khi tự chạy lại giả lập:', error)
      }
    } finally {
      setForecastLoading(false)
    }
  }, [clearSimulationResults, simulationEnd, simulationStart, viewMode])

  const handleRunSimulation = () => {
    void runSimulation(blockedSegmentIds)
  }

  useEffect(() => {
    const blockedKey = blockedSegmentIds.join('|')
    if (previousBlockedKeyRef.current === blockedKey) return

    previousBlockedKeyRef.current = blockedKey
    if (!closureMode || !simulationStart || !simulationEnd) return

    if (autoRunTimerRef.current) {
      clearTimeout(autoRunTimerRef.current)
    }

    autoRunTimerRef.current = setTimeout(() => {
      autoRunTimerRef.current = null
      void runSimulation(blockedSegmentIds, { silent: true })
    }, 350)

    return () => {
      if (autoRunTimerRef.current) {
        clearTimeout(autoRunTimerRef.current)
        autoRunTimerRef.current = null
      }
    }
  }, [blockedSegmentIds, closureMode, runSimulation, simulationEnd, simulationStart])

  useEffect(() => {
    const routePointsKey = [
      simulationStart ? simulationStart.join(',') : 'none',
      simulationEnd ? simulationEnd.join(',') : 'none',
    ].join('|')

    if (previousRoutePointsKeyRef.current === routePointsKey) return

    const hasPreviousPointState = previousRoutePointsKeyRef.current !== ''
    previousRoutePointsKeyRef.current = routePointsKey

    const hasExistingSimulation =
      viewMode === 'simulation' ||
      Boolean(baselineRoute || simulatedRoute || simulationStats || simulationRouteError)

    if (
      !hasPreviousPointState ||
      !closureMode ||
      !simulationStart ||
      !simulationEnd ||
      !hasExistingSimulation
    ) {
      return
    }

    if (autoRunTimerRef.current) {
      clearTimeout(autoRunTimerRef.current)
    }

    autoRunTimerRef.current = setTimeout(() => {
      autoRunTimerRef.current = null
      void runSimulation(blockedSegmentIds, { silent: true })
    }, 350)

    return () => {
      if (autoRunTimerRef.current) {
        clearTimeout(autoRunTimerRef.current)
        autoRunTimerRef.current = null
      }
    }
  }, [
    baselineRoute,
    blockedSegmentIds,
    closureMode,
    runSimulation,
    simulatedRoute,
    simulationEnd,
    simulationRouteError,
    simulationStart,
    simulationStats,
    viewMode,
  ])

  const handleClosureModeChange = (checked: boolean) => {
    setClosureMode(checked)
    setPredictionData([])
    clearSimulationResults()
    setViewMode('real-time')

    if (checked) {
      setSelectedRoad(null)
      setBlockedSegmentIds([])
      setSimulationStart(null)
      setSimulationEnd(null)
      setMapResetVersion(v => v + 1)
    } else {
      setBlockedSegmentIds([])
      setSimulationStart(null)
      setSimulationEnd(null)
    }
  }

  const handleRunForecast = async () => {
    if (horizon !== FORECAST_SUPPORTED_HORIZON) {
      message.warning(`Hiện tại không hỗ trợ dự báo ${horizon} phút`)
      return
    }

    if (!selectedRoad) return
    const segmentIds = (selectedRoad.forecastSegmentIds?.length
      ? selectedRoad.forecastSegmentIds
      : getForecastSegmentIds(selectedRoad.geojson)
    )
      .map((segmentId) => String(segmentId).trim())
      .filter((segmentId) => /^\d+$/.test(segmentId))

    if (segmentIds.length === 0) {
      message.warning('Trục đường này chưa có segment nào tồn tại trong fact_traffic_flow để dự báo.')
      return
    }

    setForecastLoading(true)
    setClosureMode(false)
    setPredictionData([])
    clearSimulationResults()
    try {
      const response = await predictionApi.getBatchPrediction({
        segment_ids: segmentIds,
        request_time: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
        prediction_horizon_minutes: horizon,
      })
      const normalizedItems = (response.items || []).map((item, index) => {
        const requestedSegmentId = segmentIds[index] ?? String(item.segment_id)
        return {
          ...item,
          segment_id: requestedSegmentId,
          source_segment_id: item.used_fallback
            ? item.source_segment_id === null
              ? null
              : String(item.source_segment_id)
            : requestedSegmentId,
        }
      })
      setPredictionData(normalizedItems)
      setViewMode('forecast')
      message.success(`Đã lấy dự báo AI cho ${segmentIds.length}/${selectedRoad.segmentIds.length} đoạn có dữ liệu trong ${horizon} phút tới`)
    } catch (error) {
      message.error('Lỗi khi lấy dự báo: ' + (error as Error).message)
    } finally {
      setForecastLoading(false)
    }
  }

  const handleRoadSelection = async (roadInfo: RoadInfo) => {
    if (!roadInfo.roadKey) return

    setForecastLoading(true)
    setPredictionData([])
    clearSimulationResults()
    setViewMode('real-time')
    try {
      // Fetch GeoJSON with spatial context if center is available
      const lat = roadInfo.center?.[1]
      const lng = roadInfo.center?.[0]

      const geoResponse = await mapApi.getRoadGeoJson(roadInfo.roadKey, lat, lng)

      if (geoResponse.success) {
        const geojson = geoResponse.data
        const segmentIds = uniqueSegmentIds(
          geojson.features?.map((f: any) => f.properties.segmentId) || []
        )
        const forecastSegmentIds = getForecastSegmentIds(geojson)
        // Update road info with fresh GeoJSON and metadata
        setSelectedRoad({
          ...roadInfo,
          roadName: roadInfo.roadName || roadsList.find(r => r.value === roadInfo.roadKey)?.label || 'Đường đã chọn',
          segmentCount: segmentIds.length,
          segmentIds,
          forecastSegmentIds,
          geojson
        })
        message.success('Đã định vị trục đường!')
      }
    } catch {
      message.error('Không thể lấy dữ liệu chi tiết cho trục đường này')
    } finally {
      setForecastLoading(false)
    }
  }

  const handleReset = () => {
    setViewMode('real-time')
    setSelectedRoad(null)
    setPredictionData([])
    setBlockedSegmentIds([])
    setVisualBlockedIds([])
    setBaselineRoute(null)
    setSimulatedRoute(null)
    setSimulationStats(null)
    setSimulationRouteError(null)
    setMapResetVersion(v => v + 1)
  }

  return (
    <div
      style={{
        height: `calc(100dvh - ${TICKER_HEIGHT}px)`,
        padding: 10,
        background: '#f0f2f5',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <Row gutter={[12, 0]} style={{ height: '100%' }}>
        <Col xs={24} md={16} lg={17} style={{ height: '100%' }}>
          <Card
            title={
              <Space>
                <span>Bản đồ Dự báo & Giả lập</span>
                {viewMode === 'forecast' && (
                  <Tag color="blue">DỰ BÁO AI ({horizon} PHÚT)</Tag>
                )}
                {viewMode === 'simulation' && (
                  <Tag color="purple" icon={<ExperimentOutlined />}>GIẢ LẬP PHÂN LUỒNG</Tag>
                )}
              </Space>
            }
            extra={
              viewMode !== 'real-time' && (
                <Button size="small" icon={<ReloadOutlined />} onClick={handleReset}>Quay lại Hiện tại</Button>
              )
            }
            style={{ height: '100%' }}
            bodyStyle={{ height: 'calc(100% - 57px)', padding: 0, position: 'relative' }}
          >
            {viewMode === 'real-time' ? (
              <>
                <PredictiveMap
                  key={`predictive-map-${mapResetVersion}`}
                  viewMode={viewMode}
                  predictionData={predictionData}
                  selectedRoad={selectedRoad}
                  isLoading={forecastLoading}
                  blockedSegmentIds={blockedSegmentIds}
                  simulatedRoute={null}
                  simulationStart={closureMode ? simulationStart : null}
                  simulationEnd={closureMode ? simulationEnd : null}
                />
                {forecastLoading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.45)', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(2px)' }}>
                    <Spin tip="Đang xử lý dữ liệu..." />
                  </div>
                )}
              </>
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '50%', position: 'relative', borderBottom: '2px solid #f0f0f0' }}>
                  <PredictiveMap
                    viewMode="real-time"
                    predictionData={[]}
                    selectedRoad={selectedRoad}
                    blockedSegmentIds={[]}
                    simulatedRoute={viewMode === 'simulation' ? baselineRoute : null}
                    simulatedRouteColor={[148, 120, 216, 210]}
                    simulationStart={viewMode === 'simulation' ? simulationStart : null}
                    simulationEnd={viewMode === 'simulation' ? simulationEnd : null}
                    showSummaryCard={false}
                    style={{ height: '100%' }}
                  />
                  <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', zIndex: 10 }}>
                    HIỆN TẠI / THỰC TẾ
                  </div>
                  {(simulationStats || simulationRouteError || viewMode === 'forecast') && (
                    <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 10 }}>
                      {simulationStats || simulationRouteError ? (
                        <Card size="small" bodyStyle={{ padding: '6px 12px' }} style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                          <div style={{ fontSize: '10px', color: '#8c8c8c', textTransform: 'uppercase', marginBottom: 2 }}>Cơ sở (Baseline)</div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                            {simulationStats?.originalDistance?.toFixed(1) ?? '0.0'} km | {formatMinutes(simulationStats?.originalTime)} p
                          </div>
                        </Card>
                      ) : (
                        <ForecastStatsCard
                          title="Hiện tại"
                          stats={baselineForecastStats}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div style={{ height: '50%', position: 'relative' }}>
                  <PredictiveMap
                    viewMode={viewMode}
                    predictionData={predictionData}
                    selectedRoad={selectedRoad}
                    blockedSegmentIds={
                      viewMode === 'forecast'
                        ? []
                        : visualBlockedIds.length > 0
                          ? visualBlockedIds
                          : blockedSegmentIds
                    }
                    simulatedRoute={viewMode === 'simulation' ? simulatedRoute : null}
                    simulatedRouteColor={[114, 46, 209, 255]}
                    simulationStart={viewMode === 'simulation' ? simulationStart : null}
                    simulationEnd={viewMode === 'simulation' ? simulationEnd : null}
                    showSummaryCard={false}
                    style={{ height: '100%' }}
                  />
                  <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(114,46,209,0.85)', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', zIndex: 10 }}>
                    {viewMode === 'simulation' ? 'GIẢ LẬP (SAU KHI ĐÓNG ĐƯỜNG)' : 'DỰ BÁO AI'}
                  </div>
                  {(simulationStats || simulationRouteError || viewMode === 'forecast') && (
                    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
                      {simulationRouteError ? (
                        <Card size="small" bodyStyle={{ padding: '6px 12px' }} style={{ width: 250, background: 'rgba(255,255,255,0.95)', border: '1px solid #faad14', boxShadow: '0 4px 12px rgba(250,173,20,0.16)' }}>
                          <div style={{ fontSize: '10px', color: '#ad6800', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 4 }}>
                            Không có tuyến thay thế
                          </div>
                          <Text style={{ fontSize: '12px', color: '#614700' }}>
                            {simulationRouteError}
                          </Text>
                        </Card>
                      ) : simulationStats ? (
                        <Card size="small" bodyStyle={{ padding: '6px 12px' }} style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #722ed1', boxShadow: '0 4px 12px rgba(114,46,209,0.15)' }}>
                          <div style={{ fontSize: '10px', color: '#722ed1', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 2 }}>
                            Kết quả mới
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: '900', color: '#722ed1' }}>
                            {simulationStats.distance?.toFixed(1) ?? '0.0'} km | {formatMinutes(simulationStats.time)} p
                          </div>
                          <div style={{ fontSize: '11px', color: '#cf1322', fontWeight: 600, marginTop: 2 }}>
                            +{formatMinutes(simulationStats.time - (simulationStats.originalTime || 0))}p trễ
                          </div>
                        </Card>
                      ) : (
                        <ForecastStatsCard
                          title={`Dự báo ${horizon} phút`}
                          stats={predictedForecastStats}
                          comparison={baselineForecastStats}
                          tone="forecast"
                        />
                      )}
                    </div>
                  )}
                </div>
                {forecastLoading && (
                   <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.4)', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(2px)' }}>
                     <Spin tip="Đang giả lập lộ trình..." />
                   </div>
                )}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} md={8} lg={7} style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {viewMode !== 'forecast' && (
              <Card size="small" bodyStyle={{ padding: '7px 12px' }} style={{ flex: '0 0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>Chế độ đóng đường (Admin)</Text>
                  <Switch checked={closureMode} onChange={handleClosureModeChange} />
                </div>
                {closureMode && (
                  <div style={{ marginTop: 8 }}>
                    <Alert message="Click vào bản đồ phụ để đóng/mở các đoạn đường." type="info" showIcon style={{ fontSize: '11px' }} />
                    {blockedSegmentIds.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text type="secondary" style={{ fontSize: '11px' }}>Đang đóng {blockedSegmentIds.length} đoạn đường.</Text>
                        <Button
                          type="link"
                          size="small"
                          danger
                          onClick={() => {
                            setBlockedSegmentIds([])
                            setVisualBlockedIds([])
                          }}
                        >
                          Xóa hết
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            <Card
              title={closureMode ? "Công cụ Đóng đường" : "Chọn tuyến dự báo"}
              size="small"
              style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}
              bodyStyle={{ flex: 1, minHeight: 0, padding: 4, display: 'flex', flexDirection: 'column' }}
            >
              {!closureMode && (
                <div style={{ padding: '4px 8px 8px' }}>
                  <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 4 }}>
                    Tìm kiếm trục đường (theo tên hoặc khu vực):
                  </Text>
                  <Select
                    showSearch
                    placeholder="Nhập tên đường..."
                    style={{ width: '100%' }}
                    optionFilterProp="children"
                    loading={forecastLoading}
                    value={selectedRoad?.roadKey}
                    onSelect={(value: string) => {
                      handleRoadSelection({
                        roadKey: value,
                        roadName: '',
                        segmentCount: 0,
                        segmentIds: []
                      })
                    }}
                    filterOption={(input: string, option: any) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={roadsList}
                  />
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0 }}>
                <SelectionMap
                  key={`selection-map-${mapResetVersion}`}
                  trafficStatus={trafficStatus || []}
                  viewMode={viewMode}
                  onSelect={closureMode ? () => {} : handleRoadSelection}
                  onSelectSegment={closureMode ? handleToggleBlock : undefined}
                  onSelectPoint={
                    viewMode === 'forecast'
                      ? undefined
                      : (type, pt) => {
                          if (type === 'start') setSimulationStart(pt)
                          else setSimulationEnd(pt)
                          message.success(`Đã chọn điểm ${type === 'start' ? 'Gốc' : 'Đích'}`)
                        }
                  }
                  simulationStart={simulationStart}
                  simulationEnd={simulationEnd}
                  focusRoad={selectedRoad}
                  disabled={viewMode === 'forecast'}
                  blockedSegmentIds={viewMode === 'forecast' ? [] : blockedSegmentIds}
                />
              </div>
            </Card>

            <Card size="small" style={{ flex: '0 0 auto' }} bodyStyle={{ padding: '8px 12px 10px' }}>
              <Tabs
                defaultActiveKey="1"
                size="small"
                items={[
                  {
                    key: '1',
                    label: 'Phân tích',
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {!closureMode && (
                          <div style={{ background: '#fafafa', padding: '8px', borderRadius: '4px', border: '1px solid #f0f0f0' }}>
                            <div style={{ marginBottom: 8 }}><Text strong style={{ fontSize: '12px' }}>Phạm vi dự báo:</Text></div>
                            <Radio.Group
                              value={horizon}
                              onChange={e => {
                                const nextHorizon = Number(e.target.value)
                                if (nextHorizon !== FORECAST_SUPPORTED_HORIZON) {
                                  message.warning(`Hiện tại không hỗ trợ dự báo ${nextHorizon} phút`)
                                  return
                                }
                                setHorizon(nextHorizon)
                              }}
                              size="small"
                              block
                            >
                              <Radio.Button value={15}>15p</Radio.Button>
                              <Radio.Button value={30}>30p</Radio.Button>
                              <Radio.Button value={60}>60p</Radio.Button>
                            </Radio.Group>
                          </div>
                        )}

                        {viewMode === 'simulation' ? (
                          <Alert
                            message={simulationRouteError ? 'Không có tuyến thay thế' : 'Kết quả Giả lập'}
                            description={
                              <div>
                                {simulationRouteError ? (
                                  <Text>{simulationRouteError}</Text>
                                ) : (
                                  <>
                                    <Text>Hệ thống đã tính toán lộ trình tối ưu né tránh các đoạn đường bị đóng.</Text>
                                    <br />
                                    <Text strong>Độ trễ phát sinh: {formatMinutes((simulationStats?.time || 0) - (simulationStats?.originalTime || 0))} phút.</Text>
                                  </>
                                )}
                              </div>
                            }
                            type="warning"
                          />
                        ) : closureMode ? (
                          <Alert
                            message="Thiết lập giả lập"
                            description="Chọn điểm Gốc, điểm Đích và các đoạn đường cần đóng trên bản đồ phụ."
                            type="info"
                            showIcon
                          />
                        ) : (
                          <div style={{ textAlign: 'center', padding: '10px 0' }}>
                            {selectedRoad ? (
                              <Button type="primary" block onClick={handleRunForecast} loading={forecastLoading}>Dự báo AI ({horizon}p)</Button>
                            ) : (
                              <Text type="secondary" style={{ fontSize: '12px' }}>Chọn một trục đường để xem dự báo AI</Text>
                            )}
                          </div>
                        )}

                        {closureMode && viewMode !== 'forecast' && (
                          <Button
                            type="primary"
                            danger
                            block
                            onClick={handleRunSimulation}
                            loading={forecastLoading}
                            disabled={!simulationStart || !simulationEnd}
                          >
                            Chạy Giả lập Phân luồng
                          </Button>
                        )}
                      </div>
                    )
                  },
                  ...(viewMode === 'forecast' ? [{
                    key: '2',
                    label: 'Dòng chảy',
                    children: (
                      <LineChart
                        data={{
                          labels: (predictionData || []).slice(0, 10).map(p => p.forecast_for_time ? dayjs(p.forecast_for_time).format('HH:mm') : ''),
                          datasets: [{
                            label: 'Mức độ ùn tắc dự báo',
                            data: (predictionData || []).slice(0, 10).map(p => p.congestion_level),
                            borderColor: '#1890ff',
                            tension: 0.4
                          }]
                        }}
                      />
                    )
                  }] : [])
                ]}
              />
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  )
}
