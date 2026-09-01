import React, { useState, useEffect, useRef } from 'react'
import {
  Modal,
  Form,
  Input,
  Upload,
  Switch,
  Button,
  Progress,
  Steps,
  Typography,
  Alert,
  Space,
  Card,
  message,
} from 'antd'
import {
  InboxOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { lawDocumentApi } from '@/services/api'
import { useLawIngestion } from '@/hooks/useLawIngestion'
import { IngestionProgressEvent } from '@/types'

const { Text, Title } = Typography
const { Dragger } = Upload

interface DocumentUploadModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const STEP_KEYS = [
  'FILE_LOADED',
  'AST_PARSED',
  'CHUNKS_ENRICHED',
  'EMBEDDINGS_GENERATED',
  'STORAGE_SYNCED',
  'COMPLETED',
]

const getStepIndex = (stepKey: string): number => {
  if (stepKey === 'OCR_PROCESSING' || stepKey === 'FORMAT_DETECTED') return 1
  const idx = STEP_KEYS.indexOf(stepKey)
  return idx >= 0 ? idx : 0
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [localJobId, setLocalJobId] = useState<string | null>(null)

  const { startIngestionStream, jobs, setActiveJobId } = useLawIngestion()
  const logContainerRef = useRef<HTMLDivElement | null>(null)

  const currentJob = localJobId ? jobs[localJobId] : null
  const progress = currentJob?.progress || 0
  const currentStep = currentJob?.currentStep || 'FILE_LOADED'
  const statusMessage = currentJob?.statusMessage || ''
  const logs = currentJob?.logs || []
  const jobCompleted = currentJob?.status === 'COMPLETED'
  const jobError = currentJob?.error || null

  useEffect(() => {
    if (!open) {
      // Reset state on close
      form.resetFields()
      setFileList([])
      setUploading(false)
      setLocalJobId(null)
    }
  }, [open, form])

  // Scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  const handleUploadSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (fileList.length === 0) {
        message.error('Vui lòng chọn tệp văn bản (.docx hoặc .pdf)')
        return
      }

      setUploading(true)

      const formData = new FormData()
      formData.append('file', fileList[0].originFileObj || fileList[0])
      formData.append('docCode', values.docCode)
      formData.append('docTitle', values.docTitle)
      formData.append('isScanned', values.isScanned ? 'true' : 'false')

      const res = await lawDocumentApi.uploadDocument(formData)

      if (res.success && res.data?.jobId) {
        const returnedJobId = res.data.jobId
        setLocalJobId(returnedJobId)
        setActiveJobId(returnedJobId)
        // Start SSE stream in global context
        startIngestionStream(returnedJobId, values.docCode, values.docTitle)
      } else {
        throw new Error(res.message || 'Không nhận được mã tiến trình xử lý')
      }
    } catch (err: any) {
      setUploading(false)
      message.error(err.message || 'Tải lên văn bản thất bại')
    }
  }

  const handleFinish = () => {
    onSuccess()
    onClose()
  }

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined style={{ color: '#1890ff' }} />
          <span>Tải lên & Xử lý Văn bản Pháp luật (RAG Pipeline)</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={720}
      footer={
        uploading ? (
          jobCompleted ? (
            <Button type="primary" onClick={handleFinish}>
              Hoàn tất & Đóng
            </Button>
          ) : jobError ? (
            <Button onClick={onClose}>Đóng</Button>
          ) : (
            <Button disabled loading>
              Đang xử lý tài liệu...
            </Button>
          )
        ) : (
          <Space>
            <Button onClick={onClose}>Hủy</Button>
            <Button type="primary" icon={<UploadOutlined />} onClick={handleUploadSubmit}>
              Bắt đầu Xử lý & Đánh chỉ mục
            </Button>
          </Space>
        )
      }
    >
      {!uploading ? (
        <Form form={form} layout="vertical" initialValues={{ isScanned: false }}>
          <Form.Item
            name="docCode"
            label="Số hiệu / Mã văn bản"
            rules={[{ required: true, message: 'Vui lòng nhập mã văn bản (vd: 100/2019/NĐ-CP)' }]}
          >
            <Input placeholder="Ví dụ: 100/2019/NĐ-CP hoặc 123/2021/NĐ-CP" />
          </Form.Item>

          <Form.Item
            name="docTitle"
            label="Tên / Trích yếu văn bản"
            rules={[{ required: true, message: 'Vui lòng nhập tên văn bản' }]}
          >
            <Input placeholder="Ví dụ: Nghị định quy định xử phạt vi phạm hành chính trong lĩnh vực giao thông đường bộ" />
          </Form.Item>

          <Form.Item label="Tệp tài liệu văn bản (.docx, .pdf)">
            <Dragger
              fileList={fileList}
              beforeUpload={(file) => {
                setFileList([file])
                // Auto-fill docCode if empty
                if (!form.getFieldValue('docCode')) {
                  const rawName = file.name.replace(/\.[^/.]+$/, '')
                  form.setFieldsValue({ docCode: rawName, docTitle: rawName })
                }
                return false
              }}
              onRemove={() => setFileList([])}
              maxCount={1}
              accept=".docx,.pdf"
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ fontSize: 36, color: '#1890ff' }} />
              </p>
              <p className="ant-upload-text">Kéo thả hoặc nhấp để chọn tệp nghị định</p>
              <p className="ant-upload-hint">
                Hỗ trợ định dạng Microsoft Word (.docx), PDF số hóa hoặc PDF scan văn bản gốc
              </p>
            </Dragger>
          </Form.Item>

          <Form.Item
            name="isScanned"
            label="Chế độ OCR nâng cao (Google Gemini Flash)"
            valuePropName="checked"
            extra="Bật khi tải lên tệp PDF scan hình ảnh không có lớp văn bản điện tử."
          >
            <Switch />
          </Form.Item>
        </Form>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {/* Real-time Progress Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text strong>{statusMessage || 'Đang xử lý...'}</Text>
              <Text strong style={{ color: '#1890ff' }}>
                {progress}%
              </Text>
            </div>
            <Progress
              percent={progress}
              status={jobError ? 'exception' : jobCompleted ? 'success' : 'active'}
              strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
            />
          </div>

          {/* Pipeline Steps */}
          <Steps
            size="small"
            current={getStepIndex(currentStep)}
            items={[
              { title: 'Tải tệp' },
              { title: 'Phân tích AST / OCR' },
              { title: 'Làm giàu Chunks' },
              { title: 'Tạo Embeddings' },
              { title: 'Đồng bộ Qdrant & DB' },
            ]}
          />

          {/* Status Alert */}
          {jobCompleted && (
            <Alert
              message="Đánh chỉ mục thành công!"
              description="Văn bản đã được phân tách thành các Điều/Khoản độc lập, tạo vector nhúng BAAI/bge-m3 1024-chiều và lưu trữ vào Qdrant & PostgreSQL OLTP."
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
            />
          )}

          {jobError && (
            <Alert
              message="Xử lý thất bại"
              description={jobError}
              type="error"
              showIcon
            />
          )}

          {/* Live Event Log Console */}
          <Card
            size="small"
            title="Nhật ký tiến trình thời gian thực (SSE Stream)"
            style={{ backgroundColor: '#1e1e1e', color: '#00ff66', border: 'none' }}
            headStyle={{ color: '#fff', borderBottom: '1px solid #333' }}
          >
            <div
              ref={logContainerRef}
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: '1.6',
              }}
            >
              {logs.map((log, idx) => (
                <div key={idx}>
                  <span style={{ color: '#888' }}>[{log.time}]</span> {log.msg}
                </div>
              ))}
              {!jobCompleted && !jobError && (
                <div>
                  <LoadingOutlined style={{ marginRight: 6 }} />
                  <span style={{ color: '#aaa' }}>Đang chờ tác vụ tiếp theo...</span>
                </div>
              )}
            </div>
          </Card>
        </Space>
      )}
    </Modal>
  )
}
