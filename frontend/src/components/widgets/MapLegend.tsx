// Map Legend Component

import React, { useEffect, useState } from 'react'

interface LegendItem {
  label: string
  color: string
  grade: string
}

export const MapLegend: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)')

    const update = () => setIsMobile(mediaQuery.matches)
    update()

    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  const items: LegendItem[] = [
    { grade: 'A', label: 'Thông thoáng', color: '#52C41A' },
    { grade: 'B', label: 'Khá thông thoáng', color: '#73D13D' },
    { grade: 'C', label: 'Trung bình', color: '#FAAD14' },
    { grade: 'D', label: 'Mật độ cao', color: '#D46B08' },
    { grade: 'E', label: 'Đông xe', color: '#CF1322' },
    { grade: 'F', label: 'Ùn tắc nặng', color: '#820014' },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 44,
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(10px)',
        borderRadius: isMobile ? 8 : 10,
        padding: '5px 7px',
        width: 170,
        maxWidth: isMobile ? '220px' : 'none',
        minWidth: isMobile ? 170 : 'auto',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? 3 : 6,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 2,
          alignItems: 'stretch',
        }}
      >
        {items.map((item) => (
          <div
            key={item.grade}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 4,
              height: 6,
              backgroundColor: item.color,
            }}
            title={`LOS ${item.grade}: ${item.label}`}
          >
            <span style={{ display: 'none' }}>{item.grade}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: isMobile ? 9 : 11,
          color: 'rgba(0, 0, 0, 0.72)',
          paddingInline: 1,
          fontWeight: 600,
        }}
      >
        <span>Nhanh</span>
        <span>Chậm</span>
      </div>
    </div>
  )
}
