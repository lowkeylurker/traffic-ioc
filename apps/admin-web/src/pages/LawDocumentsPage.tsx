import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Typography,
  Popconfirm,
  message,
  Row,
  Col,
  Statistic,
  Badge,
  Tooltip,
} from 'antd'
import {
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  DeleteOutlined,
  SyncOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { lawDocumentApi } from '@/services/api'
import { LawDocument, LawChunk } from '@/types'
import { useLawIngestion } from '@/hooks/useLawIngestion'
import { DocumentUploadModal } from '@/components/admin-rag/DocumentUploadModal'
import { ChunkInspectorDrawer } from '@/components/admin-rag/ChunkInspectorDrawer'

const { Title, Text } = Typography

export const LawDocumentsPage: React.FC = () => {
  const { startIngestionStream, activeJob } = useLawIngestion()
  const [documents, setDocuments] = useState<LawDocument[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [total, setTotal] = useState<number>(0)
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false)

  // Chunk inspector drawer state
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false)
  const [selectedDoc, setSelectedDoc] = useState<LawDocument | null>(null)
  const [docChunks, setDocChunks] = useState<LawChunk[]>([])
  const [chunksLoading, setChunksLoading] = useState<boolean>(false)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await lawDocumentApi.getDocuments({
        page,
        pageSize,
        search: searchTerm || undefined,
        status: statusFilter || undefined,
      })

      if (res.success && res.data) {
        setDocuments(res.data.items || [])
        setTotal(res.data.total || 0)
      }
    } catch (err: any) {
      console.error('Failed to fetch legal documents:', err)
      message.error(err.message || 'Lỗi khi tải danh sách văn bản')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchTerm, statusFilter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDocuments()
  }, [fetchDocuments])

  // Auto-refresh table when background ingestion completes
  useEffect(() => {
    if (activeJob?.status === 'COMPLETED') {
      fetchDocuments()
    }
  }, [activeJob?.status, fetchDocuments])

  // Open chunk drawer & fetch chunks
  const handleOpenInspector = async (doc: LawDocument) => {
    setSelectedDoc(doc)
    setInspectorOpen(true)
    setChunksLoading(true)
    try {
      const res = await lawDocumentApi.getDocumentChunks(doc.id)
      if (res.success) {
        setDocChunks(res.data || [])
      }
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi tải chunks văn bản')
    } finally {
      setChunksLoading(false)
    }
  }

  // Delete document
  const handleDeleteDoc = async (doc: LawDocument) => {
    try {
      const res = await lawDocumentApi.deleteDocument(doc.id)
      if (res.success) {
        message.success(res.message || `Đã xóa văn bản ${doc.code}`)
        fetchDocuments()
      }
    } catch (err: any) {
      message.error(err.message || 'Xóa văn bản thất bại')
    }
  }

  // Re-index document
  const handleReindexDoc = async (doc: LawDocument) => {
    try {
      const res = await lawDocumentApi.reindexDocument(doc.id)
      if (res.success && res.data?.jobId) {
        message.success('Đã gửi yêu cầu đánh chỉ mục lại.')
        startIngestionStream(res.data.jobId, doc.code, doc.title)
        fetchDocuments()
      }
    } catch (err: any) {
      message.error(err.message || 'Đánh chỉ mục lại thất bại')
    }
  }

  // Summary counts
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunkCount || 0), 0)
  const completedCount = documents.filter((d) => d.status === 'COMPLETED').length
  const processingCount = documents.filter((d) => d.status === 'PROCESSING').length

  const columns = [
    {
      title: 'Số hiệu Văn bản',
      dataIndex: 'code',
      key: 'code',
      width: 180,
      render: (code: string, record: LawDocument) => (
        <Space direction="vertical" size={2}>
          <Tag color="blue" style={{ fontWeight: 600, fontSize: 13 }}>
            {code}
          </Tag>
          {record.fileName && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.fileName}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Trích yếu / Tên Văn bản',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string) => (
        <Tooltip title={title}>
          <Text strong>{title}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        switch (status) {
          case 'COMPLETED':
            return (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                Đã lập chỉ mục
              </Tag>
            )
          case 'PROCESSING':
            return (
              <Tag color="processing" icon={<SyncOutlined spin />}>
                Đang xử lý
              </Tag>
            )
          case 'FAILED':
            return (
              <Tag color="error" icon={<CloseCircleOutlined />}>
                Thất bại
              </Tag>
            )
          default:
            return <Tag icon={<ClockCircleOutlined />}>{status}</Tag>
        }
      },
    },
    {
      title: 'Số Chunks',
      dataIndex: 'chunkCount',
      key: 'chunkCount',
      width: 120,
      align: 'center' as const,
      render: (count: number) => (
        <Badge
          count={count || 0}
          showZero
          style={{ backgroundColor: count > 0 ? '#108ee9' : '#d9d9d9' }}
        />
      ),
    },
    {
      title: 'Ngày tải lên',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date: string) => (
        <Text style={{ fontSize: 13 }}>
          {date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '---'}
        </Text>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      render: (_: any, record: LawDocument) => (
        <Space size={8}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleOpenInspector(record)}
          >
            Xem Chunks
          </Button>

          <Tooltip title="Đánh chỉ mục lại">
            <Popconfirm
              title="Đánh chỉ mục lại?"
              description={`Tái cấu trúc và tính toán lại vector cho ${record.code}?`}
              onConfirm={() => handleReindexDoc(record)}
              okText="Đồng ý"
              cancelText="Hủy"
            >
              <Button size="small" icon={<SyncOutlined />} />
            </Popconfirm>
          </Tooltip>

          <Tooltip title="Xóa văn bản & Vector">
            <Popconfirm
              title="Xác nhận xóa văn bản?"
              description="Toàn bộ Điều/Khoản và vector trong Qdrant sẽ bị xóa vĩnh viễn."
              onConfirm={() => handleDeleteDoc(record)}
              okText="Xóa"
              okButtonProps={{ danger: true }}
              cancelText="Hủy"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            <FileTextOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            Quản lý Văn bản Pháp luật & Tri thức Giao thông (RAG)
          </Title>
          <Text type="secondary">
            Lập chỉ mục, phân tách cây AST Nghị định (Chương - Điều - Khoản - Điểm) và đồng bộ Qdrant Vector Store
          </Text>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchDocuments}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setUploadModalOpen(true)}
          >
            Tải lên Văn bản mới
          </Button>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Tổng số văn bản"
              value={total}
              prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Tổng Chunks AST đã lập chỉ mục"
              value={totalChunks}
              prefix={<DatabaseOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Đã hoàn tất"
              value={completedCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Đang xử lý"
              value={processingCount}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<SyncOutlined spin={processingCount > 0} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card size="small">
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Input
              placeholder="Tìm kiếm theo mã số hiệu hoặc tên nghị định..."
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onPressEnter={fetchDocuments}
              allowClear
            />
          </Col>
          <Col span={6}>
            <Select
              placeholder="Lọc theo trạng thái"
              style={{ width: '100%' }}
              value={statusFilter || undefined}
              onChange={(val) => setStatusFilter(val || '')}
              allowClear
              options={[
                { label: 'Tất cả trạng thái', value: '' },
                { label: 'Đã lập chỉ mục (COMPLETED)', value: 'COMPLETED' },
                { label: 'Đang xử lý (PROCESSING)', value: 'PROCESSING' },
                { label: 'Thất bại (FAILED)', value: 'FAILED' },
              ]}
            />
          </Col>
        </Row>

        {/* Table */}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={documents}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
            showTotal: (t) => `Tổng số ${t} văn bản`,
          }}
        />
      </Card>

      {/* Modals & Drawers */}
      <DocumentUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={fetchDocuments}
      />

      <ChunkInspectorDrawer
        open={inspectorOpen}
        onClose={() => {
          setInspectorOpen(false)
          setSelectedDoc(null)
          setDocChunks([])
        }}
        document={selectedDoc}
        chunks={docChunks}
        loading={chunksLoading}
      />
    </div>
  )
}

export default LawDocumentsPage
