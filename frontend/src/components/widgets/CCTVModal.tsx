// CCTV Modal Component

import React, { useState } from 'react'
import { Modal, Button } from 'antd'
import { CameraOutlined, PlayCircleOutlined } from '@ant-design/icons'

interface CCTVModalProps {
  visible?: boolean
  onClose?: () => void
}

export const CCTVModal: React.FC<CCTVModalProps> = ({
  visible = false,
  onClose,
}) => {
  const [isPlaying, setIsPlaying] = useState(false)

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CameraOutlined style={{ fontSize: 18, color: '#1677ff' }} />
          <span>Camera Giám Sát</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      bodyStyle={{ padding: 0, overflow: 'hidden' }}
      style={{ borderRadius: 12 }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%', // 16:9 aspect ratio
          background: '#000',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {!isPlaying ? (
            <div style={{ textAlign: 'center' }}>
              <PlayCircleOutlined
                style={{ fontSize: 64, color: '#fff', marginBottom: 16 }}
              />
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
                Nhấp để phát trực tiếp
              </div>
            </div>
          ) : (
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
              📹 Trực tiếp từ camera tại Đường Lê Duẩn
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: 16, background: '#f5f5f5' }}>
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(0, 0, 0, 0.65)',
            }}
          >
            Thông tin Camera
          </div>
          <div
            style={{ fontSize: 12, color: 'rgba(0, 0, 0, 0.45)', marginTop: 4 }}
          >
            📍 Vị trí: Giao lộ Lê Duẩn - Pasteur, Quận 1
          </div>
          <div
            style={{ fontSize: 12, color: 'rgba(0, 0, 0, 0.45)', marginTop: 2 }}
          >
            🎥 Độ phân giải: 1920x1080 (Full HD)
          </div>
          <div
            style={{ fontSize: 12, color: 'rgba(0, 0, 0, 0.45)', marginTop: 2 }}
          >
            ⏱️ Cập nhật: Theo thời gian thực
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="primary"
            size="small"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{ flex: 1 }}
          >
            {isPlaying ? 'Dừng phát' : 'Phát trực tiếp'}
          </Button>
          <Button size="small" onClick={onClose} style={{ flex: 1 }}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  )
}
