export type WeatherIconType =
  | 'sun'
  | 'cloud'
  | 'rain'
  | 'storm'
  | 'fog'
  | 'snow'

export const mapConditionCodeToLabel = (
  conditionCode?: number,
  fallback?: string
): string => {
  if (!conditionCode && fallback) return fallback
  if (!conditionCode) return 'Không xác định'

  if (conditionCode >= 200 && conditionCode <= 232) return 'Giông bão'
  if (conditionCode >= 300 && conditionCode <= 321) return 'Mưa phùn'
  if (conditionCode >= 500 && conditionCode <= 531) return 'Mưa'
  if (conditionCode >= 600 && conditionCode <= 622) return 'Tuyết'
  if (conditionCode >= 701 && conditionCode <= 781) return 'Sương mù'
  if (conditionCode === 800) return 'Trời quang'
  if (conditionCode >= 801 && conditionCode <= 804) return 'Nhiều mây'

  return fallback || 'Không xác định'
}

export const mapConditionCodeToIcon = (
  conditionCode?: number
): WeatherIconType => {
  if (!conditionCode) return 'cloud'
  if (conditionCode >= 200 && conditionCode <= 232) return 'storm'
  if (conditionCode >= 300 && conditionCode <= 531) return 'rain'
  if (conditionCode >= 600 && conditionCode <= 622) return 'snow'
  if (conditionCode >= 701 && conditionCode <= 781) return 'fog'
  if (conditionCode === 800) return 'sun'
  if (conditionCode >= 801 && conditionCode <= 804) return 'cloud'
  return 'cloud'
}

export const mapImpactLevel = (level?: string) => {
  switch (level) {
    case 'HIGH':
      return {
        label: 'Tác động cao',
        color: '#cf1322',
        background: 'rgba(207, 19, 34, 0.12)',
      }
    case 'MEDIUM':
      return {
        label: 'Tác động vừa',
        color: '#d48806',
        background: 'rgba(212, 136, 6, 0.14)',
      }
    case 'LOW':
      return {
        label: 'Tác động nhẹ',
        color: '#1677ff',
        background: 'rgba(22, 119, 255, 0.12)',
      }
    default:
      return {
        label: 'Ổn định',
        color: '#389e0d',
        background: 'rgba(56, 158, 13, 0.12)',
      }
  }
}
