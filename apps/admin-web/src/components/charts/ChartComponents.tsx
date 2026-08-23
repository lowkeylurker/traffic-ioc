// Chart Components

import { ComparisonDataPoint } from '@/types'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type TooltipItem,
} from 'chart.js'
import React from 'react'
import { Bar, Doughnut, Line, Scatter } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

interface LineChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any
}

export const LineChart: React.FC<LineChartProps> = ({ data, options }) => {
  return <Line data={data} options={options} />
}

interface DoughnutChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any
}

export const DoughnutChart: React.FC<DoughnutChartProps> = ({
  data,
  options,
}) => {
  return <Doughnut data={data} options={options} />
}

export type ComparisonChartType = 'lineBand' | 'groupedBar' | 'scatter'

interface ComparisonChartProps {
  data: ComparisonDataPoint[]
  metricLabel: string
  chartType?: ComparisonChartType
}

interface DeltaBarChartProps {
  data: ComparisonDataPoint[]
  metricLabel: string
}

interface DeltaPercentBarChartProps {
  data: ComparisonDataPoint[]
}

interface RollingAverageChartProps {
  data: ComparisonDataPoint[]
  metricLabel: string
  windows: Array<3 | 6>
}

interface CumulativeMetricChartProps {
  data: ComparisonDataPoint[]
  metricLabel: string
}

interface MultiTimeframeComparisonChartProps {
  todayData: ComparisonDataPoint[]
  yesterdayData: ComparisonDataPoint[]
  lastWeekData: ComparisonDataPoint[]
  metricLabel: string
}

interface TrendPoint {
  label: string
  value: number | null
}

interface MiniSparklineChartProps {
  points: TrendPoint[]
}

interface AnomalyDistributionChartProps {
  data: ComparisonDataPoint[]
}

interface DataQualityChartProps {
  data: ComparisonDataPoint[]
}

const formatValue = (value: number | null, unit: string) => {
  if (value === null) {
    return 'N/A'
  }
  return `${value.toFixed(2)} ${unit}`
}

const getHourLabel = (hour: number) => `${hour.toString().padStart(2, '0')}:00`

const movingAverage = (values: Array<number | null>, windowSize: number) => {
  return values.map((_, idx) => {
    const start = Math.max(0, idx - windowSize + 1)
    const chunk = values.slice(start, idx + 1).filter((value) => value !== null)

    if (chunk.length === 0) {
      return null
    }

    const sum = chunk.reduce((acc, value) => acc + Number(value), 0)
    return sum / chunk.length
  })
}

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  data,
  metricLabel,
  chartType = 'lineBand',
}) => {
  const labels = data.map((point) => getHourLabel(point.hour))
  const lowerBounds = data.map((point) => point.lowerBound)
  const upperBounds = data.map((point) => point.upperBound)
  const baseline = data.map((point) => point.baselineAvg)
  const today = data.map((point) => point.todayValue)
  const anomalyFlags = data.map((point) => point.isAnomaly)
  const unit = data[0]?.unit ?? ''

  if (chartType === 'groupedBar') {
    const barData = {
      labels,
      datasets: [
        {
          label: 'Baseline',
          data: baseline,
          backgroundColor: 'rgba(22, 119, 255, 0.55)',
          borderColor: '#1677ff',
          borderWidth: 1,
        },
        {
          label: 'Today',
          data: today,
          backgroundColor: anomalyFlags.map((isAnomaly) =>
            isAnomaly ? 'rgba(255, 77, 79, 0.75)' : 'rgba(19, 194, 194, 0.65)'
          ),
          borderColor: anomalyFlags.map((isAnomaly) =>
            isAnomaly ? '#ff4d4f' : '#13c2c2'
          ),
          borderWidth: 1,
        },
      ],
    }

    const barOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        tooltip: {
          callbacks: {
            title: (items: Array<{ dataIndex: number }>) => {
              const idx = items[0]?.dataIndex ?? 0
              return `Giờ ${labels[idx]}`
            },
            afterBody: (items: Array<{ dataIndex: number }>) => {
              const idx = items[0]?.dataIndex ?? 0
              const point = data[idx]
              if (!point) {
                return []
              }
              return point.isAnomaly
                ? ['Bất thường: Có']
                : ['Bất thường: Không']
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: `${metricLabel} (${unit})`,
          },
        },
        x: {
          title: {
            display: true,
            text: 'Khung giờ',
          },
        },
      },
    }

    return <Bar data={barData} options={barOptions} />
  }

  if (chartType === 'scatter') {
    const scatterData = {
      datasets: [
        {
          label: 'Baseline',
          data: data
            .filter((point) => point.baselineAvg !== null)
            .map((point) => ({ x: point.hour, y: point.baselineAvg })),
          backgroundColor: 'rgba(22, 119, 255, 0.8)',
          pointRadius: 4,
        },
        {
          label: 'Today',
          data: data
            .filter((point) => point.todayValue !== null)
            .map((point) => ({ x: point.hour, y: point.todayValue })),
          backgroundColor: 'rgba(19, 194, 194, 0.8)',
          pointRadius: 4,
        },
        {
          label: 'Today bất thường',
          data: data
            .filter((point) => point.todayValue !== null && point.isAnomaly)
            .map((point) => ({ x: point.hour, y: point.todayValue })),
          backgroundColor: 'rgba(255, 77, 79, 0.95)',
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    }

    const scatterOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        tooltip: {
          callbacks: {
            label: (tooltipItem: TooltipItem<'scatter'>) => {
              const raw = tooltipItem.raw as unknown as
                | { x: number; y: number | null }
                | undefined

              const x = raw?.x ?? 0
              const y = raw?.y
              if (
                y === null ||
                y === undefined ||
                !Number.isFinite(Number(y))
              ) {
                return `${getHourLabel(x)}: N/A`
              }
              return `${getHourLabel(x)}: ${y.toFixed(2)} ${unit}`
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear' as const,
          min: -0.5,
          max: 23.5,
          ticks: {
            stepSize: 2,
            callback: (value: string | number) => getHourLabel(Number(value)),
          },
          title: {
            display: true,
            text: 'Khung giờ',
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: `${metricLabel} (${unit})`,
          },
        },
      },
    }

    return <Scatter data={scatterData} options={scatterOptions} />
  }

  const lineData = {
    labels,
    datasets: [
      {
        label: 'Cận dưới',
        data: lowerBounds,
        borderColor: 'rgba(0,0,0,0)',
        pointRadius: 0,
        fill: false,
      },
      {
        label: 'Dải an toàn',
        data: upperBounds,
        borderColor: 'rgba(0,0,0,0)',
        backgroundColor: 'rgba(120, 120, 120, 0.22)',
        pointRadius: 0,
        fill: '-1' as const,
      },
      {
        label: 'Baseline',
        data: baseline,
        borderColor: '#1677ff',
        backgroundColor: 'rgba(22, 119, 255, 0.12)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.25,
      },
      {
        label: 'Today',
        data: today,
        borderColor: '#13c2c2',
        backgroundColor: 'rgba(19, 194, 194, 0.2)',
        borderWidth: 2,
        tension: 0.25,
        pointRadius: (context: { dataIndex: number }) =>
          anomalyFlags[context.dataIndex] ? 5 : 3,
        pointHoverRadius: (context: { dataIndex: number }) =>
          anomalyFlags[context.dataIndex] ? 7 : 5,
        pointBackgroundColor: (context: { dataIndex: number }) =>
          anomalyFlags[context.dataIndex] ? '#ff4d4f' : '#13c2c2',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1,
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          title: (items: Array<{ dataIndex: number }>) => {
            const idx = items[0]?.dataIndex ?? 0
            return `Giờ ${labels[idx]}`
          },
          label: (context: {
            dataset: { label?: string }
            dataIndex: number
          }) => {
            const idx = context.dataIndex
            const point = data[idx]
            if (!point) {
              return ''
            }

            switch (context.dataset.label) {
              case 'Baseline':
                return `Baseline: ${formatValue(point.baselineAvg, unit)}`
              case 'Today':
                return `Today: ${formatValue(point.todayValue, unit)}${point.isAnomaly ? ' (Bất thường)' : ''}`
              case 'Dải an toàn':
                return `Band: ${formatValue(point.lowerBound, unit)} - ${formatValue(point.upperBound, unit)}`
              default:
                return ''
            }
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: `${metricLabel} (${unit})`,
        },
      },
      x: {
        title: {
          display: true,
          text: 'Khung giờ',
        },
      },
    },
  }

  return <Line data={lineData} options={lineOptions} />
}

export const ComparisonDeltaBarChart: React.FC<DeltaBarChartProps> = ({
  data,
  metricLabel,
}) => {
  const labels = data.map((point) => getHourLabel(point.hour))
  const deltas = data.map((point) => {
    if (point.todayValue === null || point.baselineAvg === null) {
      return null
    }
    return point.todayValue - point.baselineAvg
  })
  const unit = data[0]?.unit ?? ''

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Chênh lệch Today - Baseline',
        data: deltas,
        backgroundColor: deltas.map((delta) => {
          if (delta === null) {
            return 'rgba(201, 201, 201, 0.45)'
          }
          return delta >= 0
            ? 'rgba(82, 196, 26, 0.65)'
            : 'rgba(255, 77, 79, 0.7)'
        }),
        borderColor: deltas.map((delta) => {
          if (delta === null) {
            return '#d9d9d9'
          }
          return delta >= 0 ? '#52c41a' : '#ff4d4f'
        }),
        borderWidth: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        title: {
          display: true,
          text: `Delta (${metricLabel} - ${unit})`,
        },
      },
      x: {
        title: {
          display: true,
          text: 'Khung giờ',
        },
      },
    },
  }

  return <Bar data={chartData} options={options} />
}

export const ComparisonDeltaPercentBarChart: React.FC<
  DeltaPercentBarChartProps
> = ({ data }) => {
  const labels = data.map((point) => getHourLabel(point.hour))
  const deltas = data.map((point) => {
    if (point.todayValue === null || point.baselineAvg === null) {
      return null
    }

    if (point.baselineAvg === 0) {
      return null
    }

    return ((point.todayValue - point.baselineAvg) / point.baselineAvg) * 100
  })

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Delta % so với Baseline',
        data: deltas,
        backgroundColor: deltas.map((delta) => {
          if (delta === null) {
            return 'rgba(201, 201, 201, 0.45)'
          }
          return delta >= 0
            ? 'rgba(82, 196, 26, 0.65)'
            : 'rgba(255, 77, 79, 0.7)'
        }),
        borderColor: deltas.map((delta) => {
          if (delta === null) {
            return '#d9d9d9'
          }
          return delta >= 0 ? '#52c41a' : '#ff4d4f'
        }),
        borderWidth: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (tooltipItem: TooltipItem<'bar'>) => {
            const value = tooltipItem.raw as unknown as number | null
            if (value === null) {
              return 'N/A'
            }
            return `Delta: ${value.toFixed(2)}%`
          },
        },
      },
    },
    scales: {
      y: {
        title: {
          display: true,
          text: 'Delta (%)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Khung giờ',
        },
      },
    },
  }

  return <Bar data={chartData} options={options} />
}

export const RollingAverageChart: React.FC<RollingAverageChartProps> = ({
  data,
  metricLabel,
  windows,
}) => {
  const labels = data.map((point) => getHourLabel(point.hour))
  const raw = data.map((point) => point.todayValue)
  const unit = data[0]?.unit ?? ''

  const datasets = [
    {
      label: 'Today (raw)',
      data: raw,
      borderColor: '#13c2c2',
      backgroundColor: 'rgba(19, 194, 194, 0.18)',
      borderWidth: 2,
      tension: 0.25,
      pointRadius: 2,
    },
  ]

  windows.forEach((windowSize) => {
    datasets.push({
      label: `MA ${windowSize}h`,
      data: movingAverage(raw, windowSize),
      borderColor: windowSize === 3 ? '#1677ff' : '#fa8c16',
      backgroundColor:
        windowSize === 3
          ? 'rgba(22, 119, 255, 0.15)'
          : 'rgba(250, 140, 22, 0.15)',
      borderWidth: 2,
      tension: 0.28,
      pointRadius: 1.5,
    })
  })

  const chartData = {
    labels,
    datasets,
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: `${metricLabel} (${unit})`,
        },
      },
      x: {
        title: {
          display: true,
          text: 'Khung giờ',
        },
      },
    },
  }

  return <Line data={chartData} options={options} />
}

export const CumulativeMetricChart: React.FC<CumulativeMetricChartProps> = ({
  data,
  metricLabel,
}) => {
  const labels = data.map((point) => getHourLabel(point.hour))
  const unit = data[0]?.unit ?? ''

  let running = 0
  const cumulative = data.map((point) => {
    if (point.todayValue !== null) {
      running += point.todayValue
    }
    return running
  })

  const chartData = {
    labels,
    datasets: [
      {
        label: `Lũy kế ${metricLabel}`,
        data: cumulative,
        borderColor: '#fa8c16',
        backgroundColor: 'rgba(250, 140, 22, 0.2)',
        borderWidth: 2,
        tension: 0.2,
        fill: true,
        pointRadius: 2,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: `${metricLabel} tích lũy (${unit})`,
        },
      },
      x: {
        title: {
          display: true,
          text: 'Khung giờ',
        },
      },
    },
  }

  return <Line data={chartData} options={options} />
}

export const MultiTimeframeComparisonChart: React.FC<
  MultiTimeframeComparisonChartProps
> = ({ todayData, yesterdayData, lastWeekData, metricLabel }) => {
  const labels = todayData.map((point) => getHourLabel(point.hour))
  const unit = todayData[0]?.unit ?? ''

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Ngày chọn',
        data: todayData.map((point) => point.todayValue),
        borderColor: '#13c2c2',
        backgroundColor: 'rgba(19, 194, 194, 0.2)',
        borderWidth: 2,
        tension: 0.2,
      },
      {
        label: 'Hôm qua',
        data: yesterdayData.map((point) => point.todayValue),
        borderColor: '#1677ff',
        backgroundColor: 'rgba(22, 119, 255, 0.16)',
        borderWidth: 2,
        tension: 0.2,
      },
      {
        label: 'Tuần trước cùng thứ',
        data: lastWeekData.map((point) => point.todayValue),
        borderColor: '#722ed1',
        backgroundColor: 'rgba(114, 46, 209, 0.16)',
        borderWidth: 2,
        tension: 0.2,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: `${metricLabel} (${unit})`,
        },
      },
      x: {
        title: {
          display: true,
          text: 'Khung giờ',
        },
      },
    },
  }

  return <Line data={chartData} options={options} />
}

export const MiniSparklineChart: React.FC<MiniSparklineChartProps> = ({
  points,
}) => {
  const labels = points.map((point) => point.label)

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Trend 7 ngày',
        data: points.map((point) => point.value),
        borderColor: '#1677ff',
        backgroundColor: 'rgba(22, 119, 255, 0.16)',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointRadius: 2,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (tooltipItem: TooltipItem<'line'>) => {
            const raw = tooltipItem.raw as unknown as number | null
            if (raw === null) {
              return 'N/A'
            }
            return `Giá trị TB: ${Number(raw).toFixed(2)}`
          },
        },
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: false,
      },
    },
  }

  return <Line data={chartData} options={options} />
}

export const AnomalyDistributionChart: React.FC<
  AnomalyDistributionChartProps
> = ({ data }) => {
  const labels = data.map((point) => getHourLabel(point.hour))

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Mức bất thường theo giờ',
        data: data.map((point) => {
          if (
            point.todayValue === null ||
            point.lowerBound === null ||
            point.upperBound === null
          ) {
            return 0
          }

          if (point.todayValue > point.upperBound) {
            return point.todayValue - point.upperBound
          }

          if (point.todayValue < point.lowerBound) {
            return point.lowerBound - point.todayValue
          }

          return 0
        }),
        backgroundColor: data.map((point) =>
          point.isAnomaly
            ? 'rgba(255, 77, 79, 0.72)'
            : 'rgba(22, 119, 255, 0.28)'
        ),
        borderColor: data.map((point) =>
          point.isAnomaly ? '#ff4d4f' : '#b7eb8f'
        ),
        borderWidth: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (tooltipItem: TooltipItem<'bar'>) => {
            const severity = Number(tooltipItem.raw as unknown as number)
            return severity > 0
              ? `Mức lệch bất thường: ${severity.toFixed(2)}`
              : 'Không bất thường'
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Độ lệch vượt ngưỡng',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Khung giờ',
        },
      },
    },
  }

  return <Bar data={chartData} options={options} />
}

export const DataQualityDoughnutChart: React.FC<DataQualityChartProps> = ({
  data,
}) => {
  const bothAvailable = data.filter(
    (point) => point.todayValue !== null && point.baselineAvg !== null
  ).length
  const onlyToday = data.filter(
    (point) => point.todayValue !== null && point.baselineAvg === null
  ).length
  const onlyBaseline = data.filter(
    (point) => point.todayValue === null && point.baselineAvg !== null
  ).length
  const missingBoth = data.filter(
    (point) => point.todayValue === null && point.baselineAvg === null
  ).length

  const chartData = {
    labels: [
      'Đủ dữ liệu Today + Baseline',
      'Chỉ có Today',
      'Chỉ có Baseline',
      'Thiếu cả hai',
    ],
    datasets: [
      {
        label: 'Chất lượng dữ liệu',
        data: [bothAvailable, onlyToday, onlyBaseline, missingBoth],
        backgroundColor: [
          'rgba(82, 196, 26, 0.75)',
          'rgba(250, 173, 20, 0.75)',
          'rgba(22, 119, 255, 0.7)',
          'rgba(140, 140, 140, 0.7)',
        ],
        borderColor: ['#52c41a', '#faad14', '#1677ff', '#8c8c8c'],
        borderWidth: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
    },
  }

  return <Doughnut data={chartData} options={options} />
}
