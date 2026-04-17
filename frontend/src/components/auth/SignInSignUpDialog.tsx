import React, { useState } from 'react'
import {
  Modal,
  Button,
  Tabs,
  Form,
  Input,
  Checkbox,
  message,
  Divider,
} from 'antd'
import { GoogleOutlined } from '@ant-design/icons'
import { useSignIn, useSignUp, useAuth, useClerk } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import type { TabsProps } from 'antd'
import { userApi } from '@/services/api'

interface SignInSignUpDialogProps {
  open: boolean
  onClose: () => void
}

type TabKey = 'signin' | 'signup'

export const SignInSignUpDialog: React.FC<SignInSignUpDialogProps> = ({
  open,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('signin')
  const [loading, setLoading] = useState(false)
  const [verificationStep, setVerificationStep] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [form] = Form.useForm()
  const { signIn, isLoaded: isSignInLoaded } = useSignIn()
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp()
  const { isSignedIn } = useAuth()
  const { setActive } = useClerk()
  const navigate = useNavigate()

  // Auto-close dialog and sync user when signed in
  React.useEffect(() => {
    const handleSyncAndRedirect = async () => {
      if (isSignedIn && open) {
        try {
          await userApi.syncUser()
        } catch (error) {
          console.error('Failed to sync user:', error)
        }
        onClose()
        navigate('/real-time')
      }
    }
    handleSyncAndRedirect()
  }, [isSignedIn, open, onClose, navigate])

  const handleSignIn = async (values: { email: string; password: string }) => {
    if (!isSignInLoaded) return

    setLoading(true)
    try {
      const result = await signIn.create({
        identifier: values.email,
        password: values.password,
      })

      if (result.status === 'complete') {
        // Set the active session to complete the sign-in
        await setActive({ session: result.createdSessionId })
        // Sync user to DB
        try {
          await userApi.syncUser()
        } catch (e) {
          console.error('Sync failed', e)
        }
        message.success('Đăng nhập thành công')
        onClose()
        navigate('/real-time')
      } else {
        message.error('Đăng nhập thất bại. Vui lòng thử lại.')
      }
    } catch (error) {
      const err = error as { errors?: { message: string }[] }
      const errorMessage =
        err?.errors?.[0]?.message || 'Email hoặc mật khẩu không đúng'
      message.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (values: {
    firstName: string
    lastName: string
    email: string
    password: string
    confirmPassword: string
  }) => {
    if (!isSignUpLoaded) return

    if (values.password !== values.confirmPassword) {
      message.error('Mật khẩu không khớp')
      return
    }

    setLoading(true)
    try {
      const result = await signUp.create({
        firstName: values.firstName,
        lastName: values.lastName,
        emailAddress: values.email,
        password: values.password,
      })

      if (result.status === 'complete') {
        // Sync user to DB
        try {
          await userApi.syncUser()
        } catch (e) {
          console.error('Sync failed', e)
        }
        message.success('Đăng ký thành công')
        onClose()
        navigate('/real-time')
      } else if (result.status === 'missing_requirements') {
        // Initiate email verification flow
        try {
          await signUp.prepareEmailAddressVerification()
          setVerificationStep(true)
          message.success('Mã xác minh đã được gửi đến email của bạn')
        } catch (error) {
          const err = error as { errors?: { message: string }[] }
          const errorMessage =
            err?.errors?.[0]?.message ||
            'Không thể gửi mã xác minh. Vui lòng thử lại.'
          message.error(errorMessage)
        }
      } else {
        message.error('Đăng ký thất bại. Vui lòng thử lại.')
      }
    } catch (error) {
      const err = error as { errors?: { message: string }[] }
      const errorMessage = err?.errors?.[0]?.message || 'Đăng ký thất bại'
      message.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyEmail = async () => {
    if (!verificationCode) {
      message.error('Vui lòng nhập mã xác minh')
      return
    }

    setLoading(true)
    try {
      const result = await signUp?.attemptEmailAddressVerification({
        code: verificationCode,
      })

      if (result?.status === 'complete') {
        // Set the active session to complete the sign-up
        await setActive({ session: result.createdSessionId })
        // Sync user to DB
        try {
          await userApi.syncUser()
        } catch (e) {
          console.error('Sync failed', e)
        }
        message.success('Đăng ký thành công')
        setVerificationStep(false)
        setVerificationCode('')
        onClose()
        navigate('/real-time')
      } else {
        message.error('Xác minh email thất bại. Vui lòng thử lại.')
      }
    } catch (error) {
      const err = error as { errors?: { message: string }[] }
      const errorMessage =
        err?.errors?.[0]?.message || 'Mã xác minh không hợp lệ'
      message.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (!isSignInLoaded) return

    try {
      setLoading(true)
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/real-time',
        redirectUrlComplete: '/real-time',
      })
    } catch (error) {
      const err = error as { errors?: { message: string }[] }
      const errorMessage =
        err?.errors?.[0]?.message || 'Google sign-in thất bại'
      message.error(errorMessage)
      setLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    if (!isSignUpLoaded) return

    try {
      setLoading(true)
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/real-time',
        redirectUrlComplete: '/real-time',
      })
    } catch (error) {
      const err = error as { errors?: { message: string }[] }
      const errorMessage =
        err?.errors?.[0]?.message || 'Google sign-up thất bại'
      message.error(errorMessage)
      setLoading(false)
    }
  }

  const tabItems: TabsProps['items'] = [
    {
      key: 'signin',
      label: 'Đăng Nhập',
      children: (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSignIn}
          className="auth-form"
        >
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input placeholder="your.email@example.com" disabled={loading} />
          </Form.Item>

          <Form.Item
            label="Mật Khẩu"
            name="password"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
          >
            <Input.Password placeholder="Nhập mật khẩu" disabled={loading} />
          </Form.Item>

          <Form.Item>
            <Checkbox>Nhớ tôi</Checkbox>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              size="large"
            >
              Đăng Nhập
            </Button>
          </Form.Item>

          <Divider style={{ margin: '16px 0' }}>HOẶC</Divider>

          <Form.Item>
            <Button
              icon={<GoogleOutlined />}
              block
              size="large"
              loading={loading}
              onClick={handleGoogleSignIn}
            >
              Đăng nhập với Google
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center', fontSize: 14, color: '#666' }}>
            Chưa có tài khoản?{' '}
            <Button
              type="link"
              onClick={() => {
                setActiveTab('signup')
                form.resetFields()
              }}
              disabled={loading}
            >
              Đăng ký ngay
            </Button>
          </div>
        </Form>
      ),
    },
    {
      key: 'signup',
      label: 'Đăng Ký',
      children: verificationStep ? (
        <Form layout="vertical" onFinish={handleVerifyEmail}>
          <Form.Item>
            <p style={{ marginBottom: '16px', color: '#666' }}>
              Mã xác minh đã được gửi đến email của bạn. Vui lòng nhập mã để
              hoàn thành đăng ký.
            </p>
          </Form.Item>

          <Form.Item label="Mã Xác Minh" required>
            <Input
              placeholder="Nhập 6 chữ số"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              disabled={loading}
              maxLength={6}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              block
              loading={loading}
              size="large"
              onClick={handleVerifyEmail}
            >
              Xác Minh Email
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center', fontSize: 14, color: '#666' }}>
            <Button
              type="link"
              onClick={() => {
                setVerificationStep(false)
                setVerificationCode('')
              }}
              disabled={loading}
            >
              Quay lại
            </Button>
          </div>
        </Form>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSignUp}
          className="auth-form"
        >
          <Form.Item
            label="Tên"
            name="firstName"
            rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
          >
            <Input placeholder="Tên của bạn" disabled={loading} />
          </Form.Item>

          <Form.Item
            label="Họ"
            name="lastName"
            rules={[{ required: true, message: 'Vui lòng nhập họ' }]}
          >
            <Input placeholder="Họ của bạn" disabled={loading} />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input placeholder="your.email@example.com" disabled={loading} />
          </Form.Item>

          <Form.Item
            label="Mật Khẩu"
            name="password"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
              { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
            ]}
          >
            <Input.Password placeholder="Nhập mật khẩu" disabled={loading} />
          </Form.Item>

          <Form.Item
            label="Xác Nhận Mật Khẩu"
            name="confirmPassword"
            rules={[{ required: true, message: 'Vui lòng xác nhận mật khẩu' }]}
          >
            <Input.Password
              placeholder="Xác nhận mật khẩu"
              disabled={loading}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              size="large"
            >
              Đăng Ký
            </Button>
          </Form.Item>

          <Divider style={{ margin: '16px 0' }}>HOẶC</Divider>

          <Form.Item>
            <Button
              icon={<GoogleOutlined />}
              block
              size="large"
              loading={loading}
              onClick={handleGoogleSignUp}
            >
              Đăng ký với Google
            </Button>
          </Form.Item>
          <div>
            Đã có tài khoản?{' '}
            <Button
              type="link"
              onClick={() => {
                setActiveTab('signin')
                form.resetFields()
              }}
              disabled={loading}
            >
              Đăng nhập
            </Button>
          </div>
        </Form>
      ),
    },
  ]

  return (
    <Modal
      title="Xác Thực"
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={450}
      bodyStyle={{ padding: '30px' }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        items={tabItems}
      />
    </Modal>
  )
}
