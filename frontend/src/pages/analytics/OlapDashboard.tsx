import { EmptyState, ErrorState, Loading } from '@/components/common'
import { olapApi } from '@/services/api'
import {
  OlapDrillLevel,
  OlapDrilldownResponse,
  OlapHeatmapCell,
  OlapScatterPoint,
} from '@/types'
import { ReloadOutlined, RollbackOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Radio,
  Select,
  Slider,
  Space,
  Tag,
  Typography,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import type { EChartsOption } from 'echarts'
import ReactECharts from 'echarts-for-react'
import React, { useEffect, useMemo, useState } from 'react'
import './OlapDashboard.css'

const { RangePicker } = DatePicker
const { Text, Title } = Typography

const weekdayLabels = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'CN',
]

type HeatmapTooltipParam = {
  value: [number, number, number]
}

type ScatterTooltipParam = {
  value: [number, number, number, number, string]
}

type DrillTooltipParam = {
  dataIndex: number
}

type DrillClickParam = {
  name?: string
}

const parseMonthFromLabel = (label: string): number | null => {
  const m = label.match(/(\d+)/)
  if (!m) return null
  const month = Number(m[1])
  if (!Number.isFinite(month) || month < 1 || month > 12) return null
  return month
}

export const OlapDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('year'),
    dayjs(),
  ])
  const [districts, setDistricts] = useState<string[]>([])
  const [weatherImpactRange, setWeatherImpactRange] = useState<
    [number, number]
  >([0, 120])
  const [debouncedWeatherImpactRange, setDebouncedWeatherImpactRange] =
    useState<[number, number]>([0, 120])
  const [bubbleMetric, setBubbleMetric] = useState<'pcu' | 'delay'>('pcu')

  const [drillLevel, setDrillLevel] = useState<OlapDrillLevel>('year')
  const [drillValue, setDrillValue] = useState<string>(String(dayjs().year()))

  const districtQuery = useQuery({
    queryKey: ['olap-district-options'],
    queryFn: async (): Promise<string[]> => {
      const response = await olapApi.getDistricts()
      return response.data ?? []
    },
    staleTime: 5 * 60_000,
  })

  const districtOptions = useMemo(
    () =>
      (districtQuery.data ?? []).map((district) => ({
        label: district,
        value: district,
      })),
    [districtQuery.data]
  )

  const effectiveDistricts = useMemo(() => {
    if (districts.length > 0) return districts
    return districtOptions.map((item) => item.value)
  }, [districtOptions, districts])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedWeatherImpactRange(weatherImpactRange)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [weatherImpactRange])

  const filterParams = useMemo(
    () => ({
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD'),
      districts: effectiveDistricts.join(','),
      weatherImpactMin: debouncedWeatherImpactRange[0],
      weatherImpactMax: debouncedWeatherImpactRange[1],
    }),
    [dateRange, effectiveDistricts, debouncedWeatherImpactRange]
  )

  const heatmapQuery = useQuery({
    queryKey: ['olap-heatmap', filterParams],
    queryFn: async (): Promise<OlapHeatmapCell[]> => {
      const response = await olapApi.getHeatmap(filterParams)
      return response.data ?? []
    },
    staleTime: 30_000,
  })

  const scatterQuery = useQuery({
    queryKey: ['olap-scatter', filterParams],
    queryFn: async (): Promise<OlapScatterPoint[]> => {
      const response = await olapApi.getScatter(filterParams)
      return response.data ?? []
    },
    staleTime: 30_000,
  })

  const drilldownQuery = useQuery({
    queryKey: ['olap-drilldown', filterParams, drillLevel, drillValue],
    queryFn: async (): Promise<OlapDrilldownResponse> => {
      const response = await olapApi.getDrilldown({
        ...filterParams,
        type: 'drilldown',
        level: drillLevel,
        value: drillValue,
      })
      return (
        response.data ?? { level: drillLevel, value: drillValue, points: [] }
      )
    },
    staleTime: 10_000,
  })

  const isLoading =
    districtQuery.isLoading ||
    heatmapQuery.isLoading ||
    scatterQuery.isLoading ||
    drilldownQuery.isLoading ||
    districtQuery.isFetching ||
    heatmapQuery.isFetching ||
    scatterQuery.isFetching ||
    drilldownQuery.isFetching
  const isError =
    districtQuery.isError ||
    heatmapQuery.isError ||
    scatterQuery.isError ||
    drilldownQuery.isError

  const handleReset = () => {
    setDateRange([dayjs().startOf('year'), dayjs()])
    setDistricts([])
    setWeatherImpactRange([0, 120])
    setDebouncedWeatherImpactRange([0, 120])
    setDrillLevel('year')
    setDrillValue(String(dayjs().year()))
  }

  const heatmapOption = useMemo<EChartsOption>(() => {
    const seriesData = (heatmapQuery.data ?? []).map(
      ([dayOfWeek, hourOfDay, ttiValue]) => [hourOfDay, dayOfWeek, ttiValue]
    )

    // Heatmap configuration notes:
    // - Backend returns [dayOfWeek, hourOfDay, ttiValue].
    // - ECharts heatmap expects [x, y, value], where x=hour and y=day.
    // - visualMap maps low TTI (green) -> high TTI (dark red).
    return {
      tooltip: {
        position: 'top',
        formatter: (params: unknown) => {
          const typed = params as HeatmapTooltipParam
          const [hour, day, tti] = typed.value
          return `${weekdayLabels[day]} - ${hour}h: TTI ${Number(tti).toFixed(2)}`
        },
      },
      grid: {
        left: 80,
        right: 24,
        top: 24,
        bottom: 72,
      },
      xAxis: {
        type: 'category',
        name: 'Giờ trong ngày',
        data: Array.from({ length: 24 }, (_, i) => `${i}h`),
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category',
        name: 'Ngày trong tuần',
        data: weekdayLabels,
        splitArea: { show: true },
      },
      visualMap: {
        min: 1,
        max: 3.5,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 6,
        inRange: {
          color: ['#22c55e', '#facc15', '#fb923c', '#dc2626', '#7f1d1d'],
        },
      },
      series: [
        {
          name: 'Traffic TTI',
          type: 'heatmap',
          data: seriesData,
          label: { show: false },
          emphasis: {
            itemStyle: {
              shadowBlur: 8,
              shadowColor: 'rgba(0, 0, 0, 0.35)',
            },
          },
        },
      ],
    }
  }, [heatmapQuery.data])

  const scatterOption = useMemo<EChartsOption>(() => {
    const data = scatterQuery.data ?? []

    const metricMeta =
      bubbleMetric === 'pcu'
        ? {
            dataIndex: 2,
            label: 'Lưu lượng',
            unit: 'PCU',
          }
        : {
            dataIndex: 3,
            label: 'Độ trễ',
            unit: 'Giây',
          }

    const metricValues = data.map((item) =>
      Number(item[metricMeta.dataIndex] ?? 0)
    )
    const minValue = metricValues.length > 0 ? Math.min(...metricValues) : 0
    const maxValue = metricValues.length > 0 ? Math.max(...metricValues) : 0

    const normalizeBubbleSize = (value: number): number => {
      // Normalize metric values into a stable bubble size range [10px, 60px].
      // This prevents extreme magnitude differences between PCU and delay values
      // from making bubbles unreadably tiny or overwhelmingly large.
      const MIN_SIZE = 10
      const MAX_SIZE = 60

      if (!Number.isFinite(value)) return MIN_SIZE
      if (maxValue <= minValue) return (MIN_SIZE + MAX_SIZE) / 2

      const ratio = (value - minValue) / (maxValue - minValue)
      return MIN_SIZE + Math.max(0, Math.min(1, ratio)) * (MAX_SIZE - MIN_SIZE)
    }

    return {
      tooltip: {
        formatter: (params: unknown) => {
          const typed = params as ScatterTooltipParam
          const [
            weatherSeverity,
            trafficIndex,
            pcuVolume,
            delaySeconds,
            locationName,
          ] = typed.value
          const metricValue =
            bubbleMetric === 'pcu'
              ? Math.round(pcuVolume)
              : Math.round(delaySeconds)
          return [
            `<b>${locationName}</b>`,
            `Mức độ thời tiết: ${weatherSeverity.toFixed(1)}`,
            `Traffic Index: ${trafficIndex.toFixed(2)}`,
            `${metricMeta.label}: ${metricValue} ${metricMeta.unit}`,
            `Lưu lượng: ${Math.round(pcuVolume)} PCU`,
            `Độ trễ: ${Math.round(delaySeconds)} Giây`,
          ].join('<br/>')
        },
      },
      grid: { left: 60, right: 28, top: 24, bottom: 56 },
      xAxis: {
        name: 'Mức độ thời tiết (1-5)',
        type: 'value',
        min: 0,
        max: 5,
      },
      yAxis: {
        name: 'Traffic Index',
        type: 'value',
      },
      series: [
        {
          type: 'scatter',
          data,
          symbolSize: (value: number[]) => {
            const metricValue = Number(value[metricMeta.dataIndex] ?? 0)
            return normalizeBubbleSize(metricValue)
          },
          itemStyle: {
            color: 'rgba(14, 116, 144, 0.55)',
            borderColor: '#155e75',
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: {
              color: 'rgba(2, 132, 199, 0.8)',
            },
          },
        },
      ],
    }
  }, [bubbleMetric, scatterQuery.data])

  const drilldownOption = useMemo<EChartsOption>(() => {
    const points = drilldownQuery.data?.points ?? []
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const axisParams = Array.isArray(params)
            ? (params as DrillTooltipParam[])
            : []
          const first = axisParams[0]
          if (!first) return ''
          const p = points[first.dataIndex]
          if (!p) return ''
          return `${p.bucket}<br/>TTI: <b>${p.avg_tti.toFixed(2)}</b><br/>Sự cố: ${p.incident_count}`
        },
      },
      grid: { left: 48, right: 18, top: 30, bottom: 48 },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.bucket),
      },
      yAxis: {
        type: 'value',
        name: 'TTI',
      },
      series: [
        {
          type: 'bar',
          data: points.map((p) => Number(p.avg_tti.toFixed(2))),
          itemStyle: {
            color: drillLevel === 'year' ? '#2563eb' : '#0f766e',
            borderRadius: [6, 6, 0, 0],
          },
        },
      ],
    }
  }, [drillLevel, drilldownQuery.data?.points])

  const handleDrillChartClick = (params: unknown) => {
    // Drill-down click logic:
    // 1) Default state is level='year' => bars are "Tháng 1..12".
    // 2) On click month bar, parse month and switch to level='month'.
    // 3) Keep selected year in `drillValue` as YYYY-MM.
    // 4) Query key changes -> React Query refetches day-level data automatically.
    if (drillLevel !== 'year') return

    const typed = params as DrillClickParam
    const clickedLabel = String(typed?.name ?? '')
    const month = parseMonthFromLabel(clickedLabel)
    if (!month) return

    const year = Number(drillValue) || dayjs().year()
    setDrillLevel('month')
    setDrillValue(`${year}-${String(month).padStart(2, '0')}`)
  }

  const handleDrillUp = () => {
    const year = drillValue.includes('-')
      ? drillValue.split('-')[0]
      : String(dayjs().year())
    setDrillLevel('year')
    setDrillValue(year)
  }

  if (isLoading) {
    return <Loading />
  }

  if (isError) {
    return (
      <ErrorState message="Không thể tải dữ liệu BI OLAP. Vui lòng thử lại hoặc kiểm tra kết nối API OLAP." />
    )
  }

  const noHeatmap = (heatmapQuery.data?.length ?? 0) === 0
  const noScatter = (scatterQuery.data?.length ?? 0) === 0
  const noDrill = (drilldownQuery.data?.points?.length ?? 0) === 0

  return (
    <div className="olap-dashboard">
      <Card className="olap-card" bodyStyle={{ padding: 16 }}>
        <div className="olap-toolbar-header">
          <div className="olap-toolbar-title-block">
            <Title level={5} style={{ marginBottom: 4 }}>
              Cross-filtering đa chiều
            </Title>
            <Text type="secondary">
              Thay đổi bộ lọc để đồng bộ dữ liệu cho tất cả biểu đồ OLAP.
            </Text>
          </div>

          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            Reset filter
          </Button>
        </div>

        <div className="olap-filter-grid">
          <div className="olap-filter-panel">
            <Text strong>Khoảng thời gian</Text>
            <RangePicker
              className="olap-control"
              value={dateRange}
              onChange={(value) => {
                if (!value || !value[0] || !value[1]) return
                setDateRange([value[0], value[1]])
                setDrillLevel('year')
                setDrillValue(String(value[1].year()))
              }}
              allowClear={false}
            />
          </div>

          <div className="olap-filter-panel">
            <Text strong>Quận (multi-select)</Text>
            <Select
              mode="multiple"
              className="olap-control"
              value={districts}
              onChange={(value) => setDistricts(value)}
              options={districtOptions}
              maxTagCount="responsive"
              loading={districtQuery.isFetching}
              placeholder="Tất cả quận"
              allowClear
            />
          </div>

          <div className="olap-filter-panel">
            <div className="olap-filter-row">
              <Text strong>Mức ảnh hưởng thời tiết</Text>
              <Tag color="blue" style={{ marginRight: 0 }}>
                {weatherImpactRange[0]} - {weatherImpactRange[1]}
              </Tag>
            </div>
            <Slider
              className="olap-control"
              range
              min={0}
              max={200}
              step={5}
              value={weatherImpactRange}
              onChange={(value) => {
                if (!Array.isArray(value) || value.length !== 2) return
                setWeatherImpactRange([value[0], value[1]])
              }}
            />
          </div>
        </div>
      </Card>

      <div className="olap-chart-grid">
        <Card
          title="Traffic Heatmap (TTI theo Giờ/Ngày)"
          className="olap-card"
          extra={<Tag color="processing">Heatmap</Tag>}
        >
          {noHeatmap ? (
            <EmptyState message="Chưa có dữ liệu heatmap theo bộ lọc hiện tại" />
          ) : (
            <ReactECharts
              option={heatmapOption}
              style={{ height: 360 }}
              notMerge
              lazyUpdate
            />
          )}
        </Card>

        <Card
          title="Cross-analysis Bubble Chart (Weather Impact vs TTI vs Sự cố)"
          className="olap-card"
          extra={<Tag color="cyan">Bubble</Tag>}
        >
          {noScatter ? (
            <EmptyState message="Chưa có dữ liệu scatter theo bộ lọc hiện tại" />
          ) : (
            <>
              <div className="olap-filter-panel" style={{ marginBottom: 12 }}>
                <Text strong>Đại lượng Kích thước:</Text>
                <Radio.Group
                  className="olap-control"
                  optionType="button"
                  buttonStyle="solid"
                  value={bubbleMetric}
                  onChange={(event) => {
                    setBubbleMetric(event.target.value)
                  }}
                  options={[
                    { label: 'Lưu lượng xe (PCU)', value: 'pcu' },
                    { label: 'Thời gian trễ (Giây)', value: 'delay' },
                  ]}
                />
              </div>
              <ReactECharts
                option={scatterOption}
                style={{ height: 360 }}
                notMerge
                lazyUpdate
              />
              <Alert
                showIcon
                className="olap-chart-note"
                type="info"
                message="Gợi ý đọc biểu đồ"
                description="Bubble sẽ đổi kích thước theo đại lượng bạn chọn (PCU hoặc Giây) và luôn được scale trong khoảng 10-60px để so sánh trực quan hơn."
              />
            </>
          )}
        </Card>
      </div>

      <Card
        title="Drill-down Bar Chart (Khoan sâu TTI)"
        className="olap-card"
        extra={
          <Space>
            {drillLevel === 'month' && (
              <Button icon={<RollbackOutlined />} onClick={handleDrillUp}>
                Back/Up lên cấp Tháng
              </Button>
            )}
            <Tag color={drillLevel === 'year' ? 'blue' : 'geekblue'}>
              Level: {drillLevel === 'year' ? 'Năm -> Tháng' : 'Tháng -> Ngày'}
            </Tag>
          </Space>
        }
      >
        {noDrill ? (
          <EmptyState message="Chưa có dữ liệu drill-down" />
        ) : (
          <ReactECharts
            option={drilldownOption}
            style={{ height: 380 }}
            onEvents={{ click: handleDrillChartClick }}
            notMerge
            lazyUpdate
          />
        )}
      </Card>
    </div>
  )
}
