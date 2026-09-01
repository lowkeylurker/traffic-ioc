import React, { useState } from 'react'
import { Card, Progress, Tag, Button, Typography, Space, Badge } from 'antd'
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  UpOutlined,
  CloseOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useLawIngestion } from '@/hooks/useLawIngestion'

const { Text } = Typography

export const GlobalIngestionTracker: React.FC = () => {
  const { jobs, activeJobId, activeJob, dismissJob } = useLawIngestion()
  const [expanded, setExpanded] = useState(false)

  // Find most recent or currently active job
  const jobList = Object.values(jobs)
  if (jobList.length === 0) {
    return null
  }

  const currentJob = activeJob || jobList[jobList.length - 1]
  if (!currentJob) return null

  const isCompleted = currentJob.status === 'COMPLETED'
  const isFailed = currentJob.status === 'FAILED'
  const isRunning = currentJob.status === 'PROCESSING'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1050,
        maxWidth: 420,
        width: expanded ? 420 : 'auto',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
        borderRadius: 8,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {!expanded ? (
        // Mini Floating Pill
        <div
          onClick={() => setExpanded(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            backgroundColor: '#ffffff',
            borderRadius: 24,
            border: '1px solid #d9d9d9',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {isRunning && <SyncOutlined spin style={{ color: '#1890ff', fontSize: 16 }} />}
          {isCompleted && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
          {isFailed && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />}

          <Space size={6}>
            <Text strong style={{ fontSize: 13 }}>
              {currentJob.docCode}
            </Text>
            <Tag color={isRunning ? 'processing' : isCompleted ? 'success' : 'error'} style={{ margin: 0 }}>
              {isRunning ? `${currentJob.progress}%` : isCompleted ? 'Đã xong' : 'Lỗi'}
            </Tag>
          </Space>

          <Button
            type="text"
            size="small"
            icon={<UpOutlined />}
            style={{ padding: 0, height: 'auto', color: '#8c8c8c' }}
          />
        </div>
      ) : (
        // Expanded Progress Card
        <Card
          size="small"
          style={{ borderRadius: 8, overflow: 'hidden' }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space>
                <FileTextOutlined style={{ color: '#1890ff' }} />
                <Text strong style={{ fontSize: 13 }}>
                  Xử lý văn bản: {currentJob.docCode}
                </Text>
              </Space>
              <Space size={4}>
                <Button
                  type="text"
                  size="small"
                  icon={<DownOutlined />}
                  onClick={() => setExpanded(false)}
                />
                {(isCompleted || isFailed) && (
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => dismissJob(currentJob.jobId)}
                  />
                )}
              </Space>
            </div>
          }
        >
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {currentJob.statusMessage || currentJob.currentStep}
              </Text>
              <Text strong style={{ fontSize: 12, color: '#1890ff' }}>
                {currentJob.progress}%
              </Text>
            </div>
            <Progress
              percent={currentJob.progress}
              status={isFailed ? 'exception' : isCompleted ? 'success' : 'active'}
              size="small"
              strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
            />
          </div>

          {/* Log snippet */}
          <div
            style={{
              maxHeight: 120,
              overflowY: 'auto',
              backgroundColor: '#1e1e1e',
              color: '#00ff66',
              padding: 8,
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 11,
              lineHeight: '1.5',
            }}
          >
            {currentJob.logs.slice(-5).map((log, idx) => (
              <div key={idx}>
                <span style={{ color: '#888' }}>[{log.time}]</span> {log.msg}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
