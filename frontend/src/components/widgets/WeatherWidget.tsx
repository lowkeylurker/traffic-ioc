// Weather Widget

import { useMemo } from 'react'
import { MOCK_WEATHER } from '@/config/constants'
import { useWeather } from '@/hooks'
import { formatTime } from '@/utils'
import {
  mapConditionCodeToIcon,
  mapConditionCodeToLabel,
  mapImpactLevel,
  WeatherIconType,
} from '@/utils/weather'

interface WeatherWidgetProps {
  style?: React.CSSProperties
  compact?: boolean
}

const iconColorMap: Record<WeatherIconType, string> = {
  sun: '#f5b301',
  cloud: '#5b7ea6',
  rain: '#2563eb',
  storm: '#111827',
  fog: '#64748b',
  snow: '#38bdf8',
}

const WeatherIcon: React.FC<{ type: WeatherIconType }> = ({ type }) => {
  const stroke = iconColorMap[type]

  switch (type) {
    case 'sun':
      return (
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="10" stroke={stroke} strokeWidth="2.5" />
          <path
            d="M24 4v6M24 38v6M4 24h6M38 24h6M9 9l4.5 4.5M34.5 34.5L39 39M9 39l4.5-4.5M34.5 13.5L39 9"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'rain':
      return (
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
          <path
            d="M14 28a10 10 0 0119.6-3.2A7 7 0 0136 38H15a7 7 0 01-1-14z"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18 41l-2 4M26 41l-2 4M34 41l-2 4"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'storm':
      return (
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
          <path
            d="M14 26a10 10 0 0119.6-3.2A7 7 0 0136 36H15a7 7 0 01-1-14z"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M23 30l-4 8h6l-4 8"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'fog':
      return (
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
          <path
            d="M12 20a9 9 0 0117-4 6 6 0 014 11H12"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 32h32M10 38h28"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'snow':
      return (
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
          <path
            d="M14 26a10 10 0 0119.6-3.2A7 7 0 0136 36H15a7 7 0 01-1-14z"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18 40l-1 2M24 40l-1 2M30 40l-1 2"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )
    default:
      return (
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
          <path
            d="M14 26a10 10 0 0119.6-3.2A7 7 0 0136 36H15a7 7 0 01-1-14z"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  style,
  compact = false,
}) => {
  const { weather, loading, error } = useWeather()
  const data = weather ?? MOCK_WEATHER

  const conditionLabel = useMemo(
    () => mapConditionCodeToLabel(data.condition_code, data.condition_text),
    [data.condition_code, data.condition_text]
  )

  const iconType = useMemo(
    () => mapConditionCodeToIcon(data.condition_code),
    [data.condition_code]
  )

  const impact = useMemo(
    () => mapImpactLevel(data.impact_level),
    [data.impact_level]
  )

  return (
    <div
      style={{
        position: 'relative',
        width: compact ? '100%' : 330,
        zIndex: 10,
        background:
          'linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(235, 245, 255, 0.82))',
        backdropFilter: 'blur(12px)',
        borderRadius: 16,
        padding: '18px 18px 14px',
        boxShadow:
          '0 12px 36px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        transition: 'all 0.3s ease',
        fontFamily: 'Space Grotesk, Segoe UI, sans-serif',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow =
          '0 18px 46px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow =
          '0 12px 36px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.7)'
      }}
    >
      <style>{`
        @keyframes weather-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'rgba(15, 23, 42, 0.6)',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
            >
              Thời tiết
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: impact.color,
                background: impact.background,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              {impact.label}
            </span>
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 600,
              color: '#0f172a',
              marginBottom: 6,
              fontFamily:
                'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
            }}
          >
            {data.temp_c.toFixed(1)}°C
          </div>
          <p
            style={{
              margin: '0 0 8px 0',
              fontSize: 16,
              color: 'rgba(15, 23, 42, 0.75)',
              fontWeight: 600,
            }}
          >
            {conditionLabel}
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 12,
              color: 'rgba(15, 23, 42, 0.6)',
            }}
          >
            <div>
              💧 Độ ẩm:{' '}
              <span style={{ fontWeight: 600, color: 'rgba(15, 23, 42, 0.8)' }}>
                {data.humidity}%
              </span>
            </div>
            <div>
              🌬️ Gió:{' '}
              <span style={{ fontWeight: 600, color: 'rgba(15, 23, 42, 0.8)' }}>
                {data.wind_kph.toFixed(1)} km/h
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(15, 23, 42, 0.45)' }}>
              Cập nhật: {formatTime(data.last_updated)}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 6,
            filter: 'drop-shadow(0 4px 10px rgba(15, 23, 42, 0.12))',
          }}
        >
          <WeatherIcon type={iconType} />
        </div>
      </div>
      <div
        style={{
          marginTop: 12,
          borderRadius: 12,
          padding: '8px 12px',
          background: 'rgba(15, 23, 42, 0.06)',
          overflow: 'hidden',
          border: '1px solid rgba(15, 23, 42, 0.08)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            gap: 24,
            whiteSpace: 'nowrap',
            animation: data.warning_message
              ? 'weather-marquee 14s linear infinite'
              : 'none',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: error ? '#cf1322' : 'rgba(15, 23, 42, 0.75)',
            }}
          >
            {error
              ? 'Không thể tải dữ liệu thời tiết. Đang hiển thị dữ liệu gần nhất.'
              : data.warning_message || 'Không có cảnh báo thời tiết.'}
          </span>
          {data.warning_message && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: error ? '#cf1322' : 'rgba(15, 23, 42, 0.75)',
              }}
            >
              {data.warning_message}
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: 'rgba(15, 23, 42, 0.5)',
        }}
      >
        {loading
          ? 'Đang đồng bộ dữ liệu thời tiết...'
          : 'Tự động cập nhật mỗi 15 phút.'}
      </div>
    </div>
  )
}
