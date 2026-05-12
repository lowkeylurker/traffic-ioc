// Common Components

import { Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'

interface LoadingProps {
  spinning?: boolean
  size?: 'small' | 'default' | 'large'
}

export const Loading: React.FC<LoadingProps> = ({ spinning = true, size = 'large' }) => {
  return <Spin indicator={<LoadingOutlined style={{ fontSize: size === 'large' ? 48 : 24 }} spin />} spinning={spinning} />
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
  return (
    <div style={{ textAlign: 'center', padding: '50px 20px' }}>
      <p style={{ color: '#ff7875', fontSize: 16, marginBottom: 16 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '8px 16px',
            backgroundColor: '#1890ff',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Thử lại
        </button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  message?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message = 'Không có dữ liệu' }) => {
  return (
    <div style={{ textAlign: 'center', padding: '50px 20px' }}>
      <p style={{ color: '#8c8c8c', fontSize: 14 }}>{message}</p>
    </div>
  )
}
