import { LOS_COLORS } from '../constants'

/**
 * Calculates Level of Service (LOS) grade given current and free-flow speed.
 */
export function calculateLosGrade(
  currentSpeed: number,
  freeflowSpeed: number = 60
): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' {
  if (freeflowSpeed <= 0) return 'A'
  const ratio = currentSpeed / freeflowSpeed

  if (ratio >= 0.85) return 'A'
  if (ratio >= 0.7) return 'B'
  if (ratio >= 0.55) return 'C'
  if (ratio >= 0.4) return 'D'
  if (ratio >= 0.25) return 'E'
  return 'F'
}

/**
 * Returns hexadecimal color for a given LOS grade.
 */
export function getLosColor(grade: string): string {
  return LOS_COLORS[grade.toUpperCase()] || '#d9d9d9'
}

/**
 * Formats speed in km/h.
 */
export function formatSpeed(speed: number | null | undefined): string {
  if (speed === null || speed === undefined || Number.isNaN(speed)) return '--'
  return `${Math.round(speed)} km/h`
}

/**
 * Formats duration in seconds to human readable string (e.g. '25 phút', '1h 15p').
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} giây`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return remainingMins > 0 ? `${hours}h ${remainingMins}p` : `${hours} giờ`
}

/**
 * Formats distance in meters to km or meters.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
