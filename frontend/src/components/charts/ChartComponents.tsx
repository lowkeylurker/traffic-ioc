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
            label: (context: { raw: { x: number; y: number } }) => {
              const x = context.raw.x
              const y = context.raw.y
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
          label: (context: { raw: number }) => {
            const severity = Number(context.raw)
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
