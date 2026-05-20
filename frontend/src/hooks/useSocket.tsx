import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@clerk/clerk-react';
import { useNotificationStore, NotificationItem } from '@/stores/useNotificationStore';
import { notification as antdNotification } from 'antd';
import React from 'react';
import { MailOutlined } from '@ant-design/icons';

export const useSocket = () => {
  const { isSignedIn, userId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    // Chỉ kết nối socket khi admin đã đăng nhập và có userId
    if (!isSignedIn || !userId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socketUrl = import.meta.env.VITE_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:3000';
    
    // Khởi tạo connection socket
    const socket = io(socketUrl, {
      query: { userId },
      transports: ['websocket'], // Sử dụng websocket trực tiếp để tăng tốc độ và tránh polling
      reconnectionAttempts: 5,   // Tự động thử kết nối lại tối đa 5 lần nếu mất mạng
      reconnectionDelay: 3000,   // Thử lại sau mỗi 3 giây
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('⚡ [SOCKET] Connected successfully to server. ID:', socket.id);
    });

    // Lắng nghe thông báo real-time
    socket.on('notification', (data: any) => {
      console.log('📡 [SOCKET] Received notification:', data);
      
      const newNotification: NotificationItem = {
        id: data.id || String(Date.now()),
        type: data.type || 'csv_export_ready',
        title: data.title || 'Thông báo mới',
        message: data.message || '',
        downloadUrl: data.downloadUrl || undefined,
        emailPreviewUrl: data.emailPreviewUrl || undefined,
        read: data.read || false,
        createdAt: data.createdAt || new Date().toISOString(),
      };

      // 1. Lưu vào Zustand Store để cập nhật badge số trên sidebar
      addNotification(newNotification);

      // 2. Hiển thị popup toast cực kỳ chuyên nghiệp và sinh động với Antd Notification
      antdNotification.open({
        message: (
          <span style={{ fontWeight: 600, color: '#0c2340' }}>
            {newNotification.title}
          </span>
        ),
        description: (
          <div style={{ color: '#595959', fontSize: 13, marginTop: 4 }}>
            {newNotification.message}
          </div>
        ),
        icon: <MailOutlined style={{ color: '#1890ff' }} />,
        duration: 10, // Hiển thị trong 10 giây để admin chắc chắn đọc được
        placement: 'bottomRight',
        style: {
          borderRadius: 8,
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12)',
          borderLeft: '4px solid #1890ff',
        },
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 [SOCKET] Disconnected. Reason:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ [SOCKET] Connection error:', error.message);
    });

    // Cleanup giải phóng socket connection khi unmount component
    return () => {
      if (socket.connected) {
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [isSignedIn, userId, addNotification]);

  return socketRef.current;
};
