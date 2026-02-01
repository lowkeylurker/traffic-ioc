import React, { useState } from 'react'
import {
  Modal,
  Button,
  Card,
  Tabs,
  Form,
  Input,
  Checkbox,
  message,
  Divider,
} from 'antd'
import { GoogleOutlined } from '@ant-design/icons'
import { useSignIn, useSignUp, useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import type { TabsProps } from 'antd'

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
  const [form] = Form.useForm()
  const { signIn, isLoaded: isSignInLoaded } = useSignIn()
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp()
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()

  // Auto-close dialog when user is signed in
  React.useEffect(() => {
    if (isSignedIn && open) {
      onClose()
      navigate('/real-time')
    }
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
        message.success('Đăng nhập thành công')
        onClose()
        navigate('/real-time')
      } else {
        message.error('Đăng nhập thất bại. Vui lòng thử lại.')
      }
    } catch (err: any) {
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
        message.success('Đăng ký thành công')
        onClose()
        navigate('/real-time')
      } else if (result.status === 'missing_requirements') {
        message.info('Vui lòng xác minh email của bạn')
      } else {
        message.error('Đăng ký thất bại. Vui lòng thử lại.')
      }
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.message || 'Đăng ký thất bại'
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
    } catch (err: any) {
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
    } catch (err: any) {
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
      children: (
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

          <div style={{ textAlign: 'center', fontSize: 14, color: '#666' }}>
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
