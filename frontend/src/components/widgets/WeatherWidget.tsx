import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Droplets, Wind } from 'lucide-react';
import { weatherApi } from '@/services/api';
import { getWeatherIcon } from '@/utils/weatherIcons';

interface WeatherWidgetProps {
  className?: string;
  style?: React.CSSProperties;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ className, style }) => {
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['currentWeather'],
    queryFn: () => weatherApi.getCurrentWeather(),
    refetchInterval: 300000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1000,
          backdropFilter: 'blur(12px)',
          backgroundColor: 'rgba(255, 255, 255, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
          borderRadius: 12,
          padding: 16,
          width: 256,
          ...style
        }}
        className={className}
      >
        <div style={{ height: 24, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 4, width: '50%', marginBottom: 16 }}></div>
        <div style={{ height: 40, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 4, width: '100%', marginBottom: 8 }}></div>
      </div>
    );
  }

  if (error || !response?.data) {
    return null;
  }

  const weather = response.data;
  const WeatherIcon = getWeatherIcon(weather.condition_code);

  const getImpactStyles = () => {
    switch (weather.impact_level) {
      case 'MEDIUM':
        return {
          containerBorder: 'rgba(251, 146, 60, 0.5)',
          containerBg: 'rgba(255, 247, 237, 0.2)',
          iconColor: '#f97316',
          badgeBg: 'rgba(249, 115, 22, 0.2)',
          badgeText: '#c2410c',
        };
      case 'HIGH':
        return {
          containerBorder: '#ef4444',
          containerBg: 'rgba(254, 242, 242, 0.3)',
          iconColor: '#ef4444',
          badgeBg: 'rgba(239, 68, 68, 0.2)',
          badgeText: '#b91c1c',
        };
      default:
        return {
          containerBorder: 'rgba(255, 255, 255, 0.2)',
          containerBg: 'rgba(255, 255, 255, 0.3)',
          iconColor: '#4f46e5',
          badgeBg: 'transparent',
          badgeText: 'transparent',
        };
    }
  };

  const styles = getImpactStyles();

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 1000,
        backdropFilter: 'blur(12px)',
        backgroundColor: styles.containerBg,
        border: `1px solid ${styles.containerBorder}`,
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
        borderRadius: 12,
        padding: 16,
        width: 288,
        transition: 'all 0.5s ease',
        display: 'flex',
        flexDirection: 'column',
        ...style
      }}
      className={`${className} ${weather.impact_level === 'HIGH' ? 'weather-pulse-animation' : ''}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h4 style={{ fontSize: 10, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Thời tiết thực tế
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#111827' }}>
              {weather.temp_c}°C
            </span>
            <WeatherIcon size={32} color={styles.iconColor} />
          </div>
        </div>
        {(weather.impact_level === 'MEDIUM' || weather.impact_level === 'HIGH') && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 9999,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            backgroundColor: styles.badgeBg,
            color: styles.badgeText
          }}>
            <AlertTriangle size={12} />
            {weather.impact_level}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', margin: 0 }}>
          {weather.warning_message || weather.condition_code}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4b5563' }}>
          <Droplets size={14} color="#3b82f6" />
          <span>Ẩm: <b style={{ color: '#1f2937' }}>{weather.humidity}%</b></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4b5563' }}>
          <Wind size={14} color="#6b7280" />
          <span>Gió: <b style={{ color: '#1f2937' }}>{weather.wind_kph}km/h</b></span>
        </div>
      </div>

      {weather.impact_level !== 'NONE' && (
        <div style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: 8,
          borderRadius: 8,
          backgroundColor: 'rgba(255, 255, 255, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <AlertTriangle size={16} color={styles.iconColor} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 11, lineHeight: '1.2', fontWeight: 500, color: '#374151', fontStyle: 'italic', margin: 0 }}>
            {weather.warning_message}
          </p>
        </div>
      )}
    </div>
  );
};
