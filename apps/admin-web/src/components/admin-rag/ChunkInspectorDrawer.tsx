import React, { useState } from 'react'
import { Drawer, Card, Tag, Typography, Input, Empty, Spin, Space, Divider, Badge } from 'antd'
import { SearchOutlined, TagOutlined, DollarOutlined, NodeIndexOutlined } from '@ant-design/icons'
import { LawChunk, LawDocument } from '@/types'

const { Text, Paragraph, Title } = Typography

interface ChunkInspectorDrawerProps {
  open: boolean
  onClose: () => void
  document: LawDocument | null
  chunks: LawChunk[]
  loading: boolean
}

export const ChunkInspectorDrawer: React.FC<ChunkInspectorDrawerProps> = ({
  open,
  onClose,
  document,
  chunks,
  loading,
}) => {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredChunks = chunks.filter((c) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      (c.breadcrumb && c.breadcrumb.toLowerCase().includes(term)) ||
      c.content.toLowerCase().includes(term) ||
      (c.metadata?.article_number && String(c.metadata.article_number).includes(term))
    )
  })

  return (
    <Drawer
      title={
        <Space direction="vertical" size={2}>
          <Space>
            <NodeIndexOutlined style={{ color: '#1890ff' }} />
            <span>Chi tiết Chunks Văn bản: {document?.code || '---'}</span>
          </Space>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 'normal' }}>
            {document?.title}
          </Text>
        </Space>
      }
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      extra={
        <Badge
          count={`${chunks.length} chunks`}
          style={{ backgroundColor: '#52c41a' }}
        />
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="Tìm kiếm nội dung chunk hoặc số điều..."
          prefix={<SearchOutlined />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          allowClear
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" tip="Đang tải dữ liệu chunks..." />
        </div>
      ) : filteredChunks.length === 0 ? (
        <Empty description="Không có chunk nào phù hợp với bộ lọc" />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {filteredChunks.map((chunk, index) => {
            const meta = chunk.metadata || {}
            const fineMin = meta.fine_min || meta.fine_min_vnd
            const fineMax = meta.fine_max || meta.fine_max_vnd
            const vehicles = meta.vehicle_types || []
            const suspension = meta.suspension_months || meta.suspension_months_max

            return (
              <Card
                key={chunk.id || index}
                size="small"
                style={{
                  borderLeft: '4px solid #1890ff',
                  backgroundColor: '#fafafa',
                }}
              >
                {/* Header: Breadcrumb & Index */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>
                    <TagOutlined style={{ marginRight: 4 }} />
                    {chunk.breadcrumb || `Chunk #${chunk.chunkIndex + 1}`}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Index: #{chunk.chunkIndex}
                  </Text>
                </div>

                {/* Metadata Badges */}
                <Space wrap style={{ marginBottom: 8 }}>
                  {(fineMin || fineMax) && (
                    <Tag color="volcano" icon={<DollarOutlined />}>
                      Mức phạt:{' '}
                      {fineMin
                        ? new Intl.NumberFormat('vi-VN').format(fineMin)
                        : '0'}
                      đ -{' '}
                      {fineMax
                        ? new Intl.NumberFormat('vi-VN').format(fineMax)
                        : '0'}
                      đ
                    </Tag>
                  )}

                  {suspension && (
                    <Tag color="red">Tước GPLX: {suspension} tháng</Tag>
                  )}

                  {Array.isArray(vehicles) &&
                    vehicles.map((v: string) => (
                      <Tag key={v} color="geekblue">
                        {v}
                      </Tag>
                    ))}
                </Space>

                {/* Content */}
                <Paragraph
                  style={{
                    marginBottom: 8,
                    whiteSpace: 'pre-wrap',
                    fontSize: 13,
                    lineHeight: '1.6',
                    backgroundColor: '#fff',
                    padding: 10,
                    borderRadius: 4,
                    border: '1px solid #f0f0f0',
                  }}
                >
                  {chunk.content}
                </Paragraph>

                {/* Footer: Qdrant Point ID */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Qdrant Point ID: <code>{chunk.qdrantPointId || chunk.id}</code>
                  </Text>
                </div>
              </Card>
            )
          })}
        </Space>
      )}
    </Drawer>
  )
}
