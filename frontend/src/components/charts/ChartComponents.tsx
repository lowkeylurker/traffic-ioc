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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement)

interface LineChartProps {
  data: any
  options?: any
}

export const LineChart: React.FC<LineChartProps> = ({ data, options }) => {
  return <Line data={data} options={options} />
}

interface DoughnutChartProps {
  data: any
  options?: any
}

export const DoughnutChart: React.FC<DoughnutChartProps> = ({ data, options }) => {
  return <Doughnut data={data} options={options} />
}
