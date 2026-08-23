import type { IncidentImpactSegment } from '@/types'
import { PathLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import React, { useEffect, useMemo, useRef, useState } from 'react'

interface IncidentImpactLayerProps {
  visible: boolean
  segments: IncidentImpactSegment[]
  mapRef: React.RefObject<{ getMap?: () => unknown } | null>
}

const severityWidth: Record<string, number> = {
  LOW: 2,
  MEDIUM: 4,
  HIGH: 6,
  CRITICAL: 8,
}

const severityColor = (
  severity: string,
  pulseAlpha: number
): [number, number, number, number] => {
  switch (severity) {
    case 'CRITICAL':
      return [255, 30, 30, pulseAlpha]
    case 'HIGH':
      return [255, 66, 40, pulseAlpha]
    case 'MEDIUM':
      return [255, 110, 0, pulseAlpha]
    default:
      return [255, 145, 0, Math.max(110, pulseAlpha - 40)]
  }
}

const IncidentImpactLayer: React.FC<IncidentImpactLayerProps> = ({
  visible,
  segments,
  mapRef,
}) => {
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const [pulsePhase, setPulsePhase] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPulsePhase((prev) => (prev + 0.22) % (Math.PI * 2))
    }, 180)

    return () => window.clearInterval(timer)
  }, [])

  const pulseAlpha = useMemo(() => {
    const base = 140
    const amplitude = 90
    return Math.max(
      80,
      Math.min(255, Math.round(base + amplitude * Math.sin(pulsePhase)))
    )
  }, [pulsePhase])

  useEffect(() => {
    if (!mapRef.current?.getMap) return

    const map = mapRef.current.getMap() as
      | {
          addControl: (control: MapboxOverlay) => void
          removeControl: (control: MapboxOverlay) => void
        }
      | undefined
    if (!map) return

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] })
    map.addControl(overlay)
    overlayRef.current = overlay

    return () => {
      overlayRef.current = null
      map.removeControl(overlay)
    }
  }, [mapRef])

  useEffect(() => {
    if (!overlayRef.current) return

    if (!visible || segments.length === 0) {
      overlayRef.current.setProps({ layers: [] })
      return
    }

    const layer = new PathLayer<IncidentImpactSegment>({
      id: 'incident-impact-path-layer',
      data: segments,
      getPath: (d) => d.geometry.coordinates as [number, number][],
      getColor: (d) => severityColor(d.severityLevel, pulseAlpha),
      getWidth: (d) => severityWidth[d.severityLevel] ?? 2,
      widthUnits: 'pixels',
      widthMinPixels: 2,
      widthMaxPixels: 14,
      jointRounded: true,
      capRounded: true,
      pickable: false,
      updateTriggers: {
        getColor: pulseAlpha,
      },
    })

    overlayRef.current.setProps({ layers: [layer] })
  }, [visible, segments, pulseAlpha])

  return null
}

export default IncidentImpactLayer
