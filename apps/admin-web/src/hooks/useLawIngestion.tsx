import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { notification as antdNotification } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useAuth } from '@clerk/clerk-react'
import { IngestionProgressEvent } from '@/types'

export interface LawIngestionJob {
  jobId: string
  docCode: string
  docTitle: string
  progress: number
  currentStep: string
  statusMessage: string
  logs: { time: string; msg: string }[]
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  error?: string
  result?: any
}

export interface LawIngestionContextType {
  jobs: Record<string, LawIngestionJob>
  activeJobId: string | null
  activeJob: LawIngestionJob | null
  isProcessing: boolean
  startIngestionStream: (jobId: string, docCode: string, docTitle: string) => Promise<void>
  setActiveJobId: (jobId: string | null) => void
  dismissJob: (jobId: string) => void
  clearAllJobs: () => void
}

const LawIngestionContext = createContext<LawIngestionContextType | undefined>(undefined)

export const LawIngestionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<Record<string, LawIngestionJob>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const isConnectingRef = useRef<boolean>(false)
  const activeCtrlRef = useRef<AbortController | null>(null)
  const { getToken, isSignedIn, isLoaded } = useAuth()

  // 1. Initialize singleton global SSE stream connection at page load
  useEffect(() => {
    // Only connect when Clerk has finished loading and user is signed in
    if (!isLoaded || !isSignedIn) {
      if (activeCtrlRef.current) {
        activeCtrlRef.current.abort()
        activeCtrlRef.current = null
      }
      isConnectingRef.current = false
      return
    }

    // Prevent duplicate stream connections (e.g. from React StrictMode or re-renders)
    if (isConnectingRef.current || activeCtrlRef.current) {
      return
    }

    isConnectingRef.current = true
    const ctrl = new AbortController()
    activeCtrlRef.current = ctrl

    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'
    const globalStreamUrl = `${apiBase}/admin/rag/documents/stream`

    const connectGlobalStream = async () => {
      let token: string | null = null
      try {
        token = await getToken()
      } catch (tokenErr) {
        console.warn('Could not get Clerk access token for global stream:', tokenErr)
      }

      // Check if aborted during token fetch
      if (ctrl.signal.aborted) return

      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      fetchEventSource(globalStreamUrl, {
        method: 'GET',
        headers,
        signal: ctrl.signal,
        async onopen(response) {
          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            console.log('⚡ [GLOBAL-SSE] Connected to global law ingestion stream on page load')
            return
          }
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new Error(`Global stream server returned ${response.status}: ${response.statusText}`)
          }
        },
        onmessage(msg) {
          if (msg.event === 'init') {
            try {
              const data = JSON.parse(msg.data)
              console.log('⚡ [GLOBAL-SSE] Initialized:', data.message)
            } catch (err) {
              console.error('Error parsing global init event:', err)
            }
          } else if (msg.event === 'progress') {
            try {
              const data: IngestionProgressEvent & { jobId?: string; docCode?: string } = JSON.parse(msg.data)
              const jobId = data.jobId
              if (!jobId) return

              setJobs((prev) => {
                const current = prev[jobId] || {
                  jobId,
                  docCode: data.docCode || 'Văn bản',
                  docTitle: data.docCode || 'Văn bản pháp luật',
                  progress: 0,
                  currentStep: 'FILE_LOADED',
                  statusMessage: '',
                  logs: [],
                  status: 'PROCESSING',
                }
                return {
                  ...prev,
                  [jobId]: {
                    ...current,
                    progress: data.percent || current.progress,
                    currentStep: data.step || current.currentStep,
                    statusMessage: data.message || current.statusMessage,
                    logs: [
                      ...current.logs,
                      {
                        time: new Date().toLocaleTimeString('vi-VN'),
                        msg: `[${data.step}] ${data.message}`,
                      },
                    ],
                  },
                }
              })
              setActiveJobId((prev) => prev || jobId)
            } catch (err) {
              console.error('Error parsing global progress event:', err)
            }
          } else if (msg.event === 'complete') {
            try {
              const data = JSON.parse(msg.data)
              const jobId = data.jobId
              if (!jobId) return

              setJobs((prev) => {
                const current = prev[jobId]
                if (!current) return prev
                return {
                  ...prev,
                  [jobId]: {
                    ...current,
                    progress: 100,
                    currentStep: 'COMPLETED',
                    status: 'COMPLETED',
                    statusMessage: data.message || 'Lập chỉ mục thành công!',
                    result: data,
                    logs: [
                      ...current.logs,
                      {
                        time: new Date().toLocaleTimeString('vi-VN'),
                        msg: `[COMPLETED] Hoàn tất: ${data.chunks_count || 0} chunks đã lưu vào Qdrant & OLTP.`,
                      },
                    ],
                  },
                }
              })

              antdNotification.success({
                message: `Lập chỉ mục thành công: ${data.doc_code || data.docCode || 'Văn bản'}`,
                description: `Văn bản đã được phân tích cây AST và đồng bộ vector Qdrant.`,
                icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
                placement: 'bottomRight',
                duration: 6,
              })
            } catch (err) {
              console.error('Error parsing global complete event:', err)
            }
          } else if (msg.event === 'error') {
            try {
              const data = JSON.parse(msg.data)
              const jobId = data.jobId
              if (!jobId) return

              const errMsg = data.error || 'Quá trình xử lý văn bản thất bại'

              setJobs((prev) => {
                const current = prev[jobId]
                if (!current) return prev
                return {
                  ...prev,
                  [jobId]: {
                    ...current,
                    status: 'FAILED',
                    error: errMsg,
                    logs: [
                      ...current.logs,
                      {
                        time: new Date().toLocaleTimeString('vi-VN'),
                        msg: `[ERROR] ${errMsg}`,
                      },
                    ],
                  },
                }
              })

              antdNotification.error({
                message: `Lỗi xử lý văn bản: ${data.doc_code || data.docCode || 'Văn bản'}`,
                description: errMsg,
                icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
                placement: 'bottomRight',
                duration: 8,
              })
            } catch {
              // Ignore
            }
          }
        },
        onclose() {
          console.log('🔌 [GLOBAL-SSE] Stream closed')
          isConnectingRef.current = false
        },
        onerror(err) {
          if (ctrl.signal.aborted) return
          console.error('❌ [GLOBAL-SSE] Global stream error:', err)
          isConnectingRef.current = false
        },
      }).catch((fetchErr) => {
        if (!ctrl.signal.aborted) {
          console.warn('Global SSE fetch error:', fetchErr)
        }
        isConnectingRef.current = false
      })
    }

    connectGlobalStream()

    return () => {
      ctrl.abort()
      activeCtrlRef.current = null
      isConnectingRef.current = false
    }
  }, [isLoaded, isSignedIn])

  // 2. Client-triggered action when starting a new document upload or reindex
  const startIngestionStream = useCallback(
    async (jobId: string, docCode: string, docTitle: string) => {
      const newJob: LawIngestionJob = {
        jobId,
        docCode,
        docTitle,
        progress: 5,
        currentStep: 'FILE_LOADED',
        statusMessage: 'Đang khởi tạo tiến trình xử lý văn bản...',
        logs: [
          {
            time: new Date().toLocaleTimeString('vi-VN'),
            msg: `[START] Tiếp nhận tệp văn bản ${docCode}`,
          },
        ],
        status: 'PROCESSING',
      }

      setJobs((prev) => ({ ...prev, [jobId]: newJob }))
      setActiveJobId(jobId)
    },
    []
  )

  const dismissJob = useCallback((jobId: string) => {
    setJobs((prev) => {
      const next = { ...prev }
      delete next[jobId]
      return next
    })
    setActiveJobId((prev) => (prev === jobId ? null : prev))
  }, [])

  const clearAllJobs = useCallback(() => {
    setJobs({})
    setActiveJobId(null)
  }, [])

  const activeJob = activeJobId ? jobs[activeJobId] || null : null
  const isProcessing = Object.values(jobs).some((j) => j.status === 'PROCESSING')

  return (
    <LawIngestionContext.Provider
      value={{
        jobs,
        activeJobId,
        activeJob,
        isProcessing,
        startIngestionStream,
        setActiveJobId,
        dismissJob,
        clearAllJobs,
      }}
    >
      {children}
    </LawIngestionContext.Provider>
  )
}

export const useLawIngestion = (): LawIngestionContextType => {
  const context = useContext(LawIngestionContext)
  if (!context) {
    throw new Error('useLawIngestion must be used within a LawIngestionProvider')
  }
  return context
}

