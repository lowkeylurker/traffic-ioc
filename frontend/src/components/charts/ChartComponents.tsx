// Chart Components

import React from 'react'
import { Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
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
