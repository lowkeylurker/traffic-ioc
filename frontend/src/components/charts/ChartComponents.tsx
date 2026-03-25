// Chart Components

import { ComparisonDataPoint } from '@/types'
import {
  ArcElement,
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
import { Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
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

interface ComparisonChartProps {
  data: ComparisonDataPoint[]
  metricLabel: string
}

const formatValue = (value: number | null, unit: string) => {
  if (value === null) {
    return 'N/A'
  }
  return `${value.toFixed(2)} ${unit}`
}

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  data,
  metricLabel,
}) => {
  const labels = data.map(
    (point) => `${point.hour.toString().padStart(2, '0')}:00`
  )
  const lowerBounds = data.map((point) => point.lowerBound)
  const upperBounds = data.map((point) => point.upperBound)
  const baseline = data.map((point) => point.baselineAvg)
  const today = data.map((point) => point.todayValue)
  const anomalyFlags = data.map((point) => point.isAnomaly)
  const unit = data[0]?.unit ?? ''

  const chartData = {
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

  const options = {
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

  return <Line data={chartData} options={options} />
}
