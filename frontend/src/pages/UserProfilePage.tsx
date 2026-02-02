import React, { useState } from 'react'
import {
  Card,
  Descriptions,
  Button,
  Space,
  Avatar,
  Row,
  Col,
  Divider,
  Modal,
  Form,
  Input,
  message,
  Upload,
} from 'antd'
import { useUser, useAuth } from '@clerk/clerk-react'
import {
  EditOutlined,
  LockOutlined,
  CameraOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Loading } from '@/components'
import type { UploadFile } from 'antd'

export const UserProfilePage: React.FC = () => {
  const { user, isLoaded } = useUser()
  const { signOut } = useAuth()
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [passwordModalVisible, setPasswordModalVisible] = useState(false)
  const [editForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [passwordStep, setPasswordStep] = useState<'request' | 'verify'>(
    'request'
  )

  if (!isLoaded) {
    return <Loading />
  }

  if (!user) {
    return <div>User not found</div>
  }

  const userRole = (user?.publicMetadata?.role as string) || 'user'

  const handleEditProfile = () => {
    editForm.setFieldsValue({
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
    })
    setEditModalVisible(true)
  }

  const handleUpdateProfile = async () => {
    try {
      setLoading(true)
      const values = await editForm.validateFields()

      await user.update({
        firstName: values.firstName,
        lastName: values.lastName,
        username: values.username,
      })

      message.success('Cập nhật thông tin thành công!')
      setEditModalVisible(false)
    } catch (error) {
      console.error('Error updating profile:', error)
      message.error('Cập nhật thông tin thất bại!')
    } finally {
      setLoading(false)
    }
  }

  const handleAvatarUpload = async (file: File) => {
    try {
      setAvatarUploading(true)
      await user.setProfileImage({ file })
      message.success('Cập nhật ảnh đại diện thành công!')
    } catch (error) {
      console.error('Error uploading avatar:', error)
      message.error('Cập nhật ảnh đại diện thất bại!')
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleChangePassword = () => {
    passwordForm.resetFields()
    setPasswordStep('request')
    setPasswordModalVisible(true)
  }

  const handleRequestPasswordChange = async () => {
    try {
      setLoading(true)
      const values = await passwordForm.validateFields(['currentPassword'])

      // Request OTP for password change
      await user.primaryEmailAddress?.prepareVerification({
        strategy: 'email_code',
      })

      setPasswordStep('verify')
      message.success('Mã OTP đã được gửi đến email của bạn!')
    } catch (error) {
      console.error('Error requesting password change:', error)
      message.error('Yêu cầu đổi mật khẩu thất bại!')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyAndChangePassword = async () => {
    try {
      setLoading(true)
      const values = await passwordForm.validateFields([
        'newPassword',
        'confirmPassword',
        'otp',
      ])

      if (values.newPassword !== values.confirmPassword) {
        message.error('Mật khẩu mới không khớp!')
        return
      }

      // Verify OTP and update password
      await user.updatePassword({
        newPassword: values.newPassword,
        signOutOfOtherSessions: true,
      })

      message.success('Đổi mật khẩu thành công!')
      setPasswordModalVisible(false)
      passwordForm.resetFields()
      setPasswordStep('request')
    } catch (error) {
      console.error('Error changing password:', error)
      message.error('Đổi mật khẩu thất bại! Vui lòng kiểm tra mã OTP.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={24}>
        <Col xs={24} sm={24} md={8} lg={8}>
          <Card style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Avatar
                size={120}
                src={user.imageUrl}
                alt={`${user.firstName} ${user.lastName}`}
                style={{ marginBottom: '16px' }}
              />
              <Upload
                showUploadList={false}
                beforeUpload={(file) => {
                  handleAvatarUpload(file)
                  return false
                }}
                accept="image/*"
              >
                <Button
                  shape="circle"
                  icon={<CameraOutlined />}
                  loading={avatarUploading}
                  style={{
                    position: 'absolute',
                    bottom: '16px',
                    right: '0',
                  }}
                />
              </Upload>
            </div>
            <h2 style={{ marginBottom: '8px' }}>
              {user.firstName} {user.lastName}
            </h2>
            <p style={{ color: 'rgba(0,0,0,0.65)', marginBottom: '16px' }}>
              @{user.username || 'user'}
            </p>
            <Space>
              <Button icon={<EditOutlined />} onClick={handleEditProfile}>
                Chỉnh sửa
              </Button>
              <Button icon={<LockOutlined />} onClick={handleChangePassword}>
                Đổi mật khẩu
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={16} lg={16}>
          <Card title="Thông tin cá nhân">
            <Descriptions column={1} bordered>
              <Descriptions.Item label="Tên">
                {user.firstName} {user.lastName}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {user.primaryEmailAddress?.emailAddress || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">
                {user.primaryPhoneNumber?.phoneNumber || 'Chưa cập nhật'}
              </Descriptions.Item>
              <Descriptions.Item label="Vai trò">
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    backgroundColor:
                      userRole === 'admin' ? '#ff7875' : '#87d068',
                    color: '#fff',
                  }}
                >
                  {userRole === 'admin' ? 'Quản trị viên' : 'Người dùng'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Ngôn ngữ">Tiếng Việt</Descriptions.Item>
            </Descriptions>
          </Card>

          <Divider />

          <Card title="Hoạt động">
            <Descriptions column={1}>
              <Descriptions.Item label="Tài khoản tạo lúc">
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('vi-VN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Cập nhật lần cuối">
                {user.updatedAt
                  ? new Date(user.updatedAt).toLocaleDateString('vi-VN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Divider />

          <Space>
            <Button
              danger
              onClick={async () => {
                await signOut()
              }}
            >
              Đăng xuất
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Edit Profile Modal */}
      <Modal
        title="Chỉnh sửa thông tin cá nhân"
        open={editModalVisible}
        onOk={handleUpdateProfile}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={loading}
        okText="Lưu"
        cancelText="Hủy"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="Họ"
            name="firstName"
            rules={[{ required: true, message: 'Vui lòng nhập họ!' }]}
          >
            <Input placeholder="Nhập họ" />
          </Form.Item>
          <Form.Item
            label="Tên"
            name="lastName"
            rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}
          >
            <Input placeholder="Nhập tên" />
          </Form.Item>
          <Form.Item
            label="Tên người dùng"
            name="username"
            rules={[
              { required: true, message: 'Vui lòng nhập tên người dùng!' },
            ]}
          >
            <Input placeholder="Nhập tên người dùng" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title="Đổi mật khẩu"
        open={passwordModalVisible}
        onOk={
          passwordStep === 'request'
            ? handleRequestPasswordChange
            : handleVerifyAndChangePassword
        }
        onCancel={() => {
          setPasswordModalVisible(false)
          passwordForm.resetFields()
          setPasswordStep('request')
        }}
        confirmLoading={loading}
        okText={passwordStep === 'request' ? 'Gửi mã OTP' : 'Đổi mật khẩu'}
        cancelText="Hủy"
      >
        <Form form={passwordForm} layout="vertical">
          {passwordStep === 'request' ? (
            <>
              <Form.Item
                label="Mật khẩu hiện tại"
                name="currentPassword"
                rules={[
                  {
                    required: true,
                    message: 'Vui lòng nhập mật khẩu hiện tại!',
                  },
                ]}
              >
                <Input.Password placeholder="Nhập mật khẩu hiện tại" />
              </Form.Item>
              <p style={{ color: 'rgba(0,0,0,0.45)' }}>
                Chúng tôi sẽ gửi mã OTP đến email của bạn để xác thực.
              </p>
            </>
          ) : (
            <>
              <Form.Item
                label="Mã OTP"
                name="otp"
                rules={[{ required: true, message: 'Vui lòng nhập mã OTP!' }]}
              >
                <Input placeholder="Nhập mã OTP từ email" maxLength={6} />
              </Form.Item>
              <Form.Item
                label="Mật khẩu mới"
                name="newPassword"
                rules={[
                  { required: true, message: 'Vui lòng nhập mật khẩu mới!' },
                  { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự!' },
                ]}
              >
                <Input.Password placeholder="Nhập mật khẩu mới" />
              </Form.Item>
              <Form.Item
                label="Xác nhận mật khẩu mới"
                name="confirmPassword"
                rules={[
                  {
                    required: true,
                    message: 'Vui lòng xác nhận mật khẩu mới!',
                  },
                ]}
              >
                <Input.Password placeholder="Nhập lại mật khẩu mới" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  )
}
