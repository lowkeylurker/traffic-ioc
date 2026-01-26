// Real-Time Operations Page

import React from 'react'
import { Card, Spin } from 'antd'
import { TrafficMap } from '@/components/map/TrafficMap'
import { WeatherWidget } from '@/components/widgets/WeatherWidget'
import { AlertFeed } from '@/components/widgets/AlertFeed'
import { Loading, ErrorState } from '@/components/common'
import { useSegments, useTrafficStatus } from '@/hooks/useTraffic'
import { useAppStore } from '@/stores/useAppStore'
import { MOCK_ALERTS } from '@/config/constants'

export const RealTimePage: React.FC = () => {
  const segments = useSegments()
  const trafficStatus = useTrafficStatus()
  const { isLoading, error } = useAppStore()

  if (isLoading && segments.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Loading />
      </div>
    )
  }

  if (error && segments.length === 0) {
    return <ErrorState message={error} />
  }

  return (
    <Card
      style={{
        height: 'calc(100vh - 150px)',
        padding: 0,
        borderRadius: 0,
      }}
      bodyStyle={{ padding: 0, height: '100%', position: 'relative' }}
    >
      {/* Main Map */}
      <TrafficMap segments={segments} trafficStatus={trafficStatus} style={{ height: '100%' }} />

      {/* Overlays */}
      <WeatherWidget />
      <AlertFeed alerts={MOCK_ALERTS} />
    </Card>
  )
}
