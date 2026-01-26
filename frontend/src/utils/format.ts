// Utility Functions

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { DATE_FORMAT, TIME_FORMAT, DATETIME_FORMAT } from '@/config/constants'

dayjs.extend(relativeTime)

export const formatDate = (date: Date | string): string => {
  return dayjs(date).format(DATE_FORMAT)
}

export const formatTime = (date: Date | string): string => {
  return dayjs(date).format(TIME_FORMAT)
}

export const formatDateTime = (date: Date | string): string => {
  return dayjs(date).format(DATETIME_FORMAT)
}

export const formatRelativeTime = (date: Date | string): string => {
  return dayjs(date).fromNow()
}

export const formatSpeed = (speed: number): string => {
  return `${speed.toFixed(1)} km/h`
}

export const formatDistance = (distance: number): string => {
  if (distance < 1) {
    return `${(distance * 1000).toFixed(0)} m`
  }
  return `${distance.toFixed(1)} km`
}

export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${value.toFixed(decimals)}%`
}

export const getLosColor = (los: string): string => {
  const colors: Record<string, string> = {
    A: '#52c41a',
    B: '#85ce61',
    C: '#faad14',
    D: '#ff7a45',
    E: '#f5222d',
    F: '#722ed1',
  }
  return colors[los] || '#1890ff'
}

export const getSeverityColor = (severity: number): string => {
  if (severity <= 1) return '#52c41a'
  if (severity <= 2) return '#faad14'
  if (severity <= 3) return '#ff7a45'
  return '#f5222d'
}

export const getSeverityLabel = (severity: number): string => {
  const labels = ['Thấp', 'Trung bình', 'Cao', 'Rất cao', 'Khẩn cấp']
  return labels[severity - 1] || 'Không xác định'
}
