// Weather Widget

import { Cloud, CloudRain } from 'lucide-react'
import { MOCK_WEATHER } from '@/config/constants'

interface WeatherWidgetProps {
  style?: React.CSSProperties
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ style }) => {
  const weather = MOCK_WEATHER

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: 24,
        width: 320,
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 12,
        padding: '20px',
        boxShadow:
          '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        transition: 'all 0.3s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow =
          '0 12px 48px 0 rgba(0, 0, 0, 0.12), 0 4px 12px 0 rgba(0, 0, 0, 0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow =
          '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: 1 }}>
          <h4
            style={{
              margin: '0 0 16px 0',
              fontSize: 14,
              fontWeight: 600,
              color: 'rgba(0, 0, 0, 0.65)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Thời tiết
          </h4>
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: '#001529',
              marginBottom: 8,
              fontFamily: 'Roboto Mono, monospace',
            }}
          >
            {weather.temperature}°C
          </div>
          <p
            style={{
              margin: '0 0 12px 0',
              fontSize: 16,
              color: 'rgba(0, 0, 0, 0.75)',
              fontWeight: 500,
            }}
          >
            {weather.condition}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 13, color: 'rgba(0, 0, 0, 0.55)' }}>
              💧 Độ ẩm:{' '}
              <span style={{ fontWeight: 600, color: 'rgba(0, 0, 0, 0.75)' }}>
                {weather.humidity}%
              </span>
            </div>
            {weather.rainfall > 0 && (
              <div style={{ fontSize: 13, color: '#ff7a45', fontWeight: 500 }}>
                🌧️ Mưa: {weather.rainfall}mm
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            fontSize: 48,
            color: weather.rainfall > 0 ? '#1677ff' : '#faad14',
            marginLeft: 16,
            filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
          }}
        >
          {weather.rainfall > 0 ? (
            <CloudRain size={48} strokeWidth={1.5} />
          ) : (
            <Cloud size={48} strokeWidth={1.5} />
          )}
        </div>
      </div>
    </div>
  )
}
