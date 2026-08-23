// Traffic Domain & Geospatial Constants

export const DEFAULT_MAP_CENTER: [number, number] = [106.7009, 10.7769]
export const DEFAULT_MAP_ZOOM = 14

export const LOS_COLORS: Record<string, string> = {
  A: '#52C41A',
  B: '#73D13D',
  C: '#FAAD14',
  D: '#D46B08',
  E: '#CF1322',
  F: '#820014',
}

export const TRAFFIC_COLORS = {
  MINIMAL: '#52C41A',
  VERY_LOW: '#73D13D',
  MODERATE: '#FAAD14',
  HIGH: '#D46B08',
  VERY_HIGH: '#CF1322',
  EXTREME: '#820014',
  JAM: '#cf1322',
  INCIDENT: '#722ed1',
  NO_DATA: '#d9d9d9',
}

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  ACCIDENT: 'Tai nạn giao thông',
  FLOOD: 'Ngập lụt',
  CONSTRUCTION: 'Công trường / Thi công',
  FIRE: 'Cháy nổ',
  OTHER: 'Sự cố khác',
}

export const INCIDENT_SEVERITY_COLORS: Record<string, string> = {
  LOW: '#52C41A',
  MEDIUM: '#FAAD14',
  HIGH: '#FA8C16',
  CRITICAL: '#F5222D',
}
