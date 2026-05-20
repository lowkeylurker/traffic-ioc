import { create } from 'zustand';
import { userApi } from '@/services/api';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface NotificationStore {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  
  // Hành động với store và API
  fetchNotifications: () => Promise<void>;
  addNotification: (notification: NotificationItem) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    try {
      set({ loading: true });
      const response = await userApi.getNotifications();
      const items = (response.data ?? []).map((item: any) => ({
        id: item._id || item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        read: item.read,
        createdAt: item.createdAt || item.timestamp,
      }));

      const unreadCount = items.filter((n: NotificationItem) => !n.read).length;
      set({ notifications: items, unreadCount, loading: false });
    } catch (error) {
      console.error('Failed to fetch notifications', error);
      set({ loading: false });
    }
  },

  addNotification: (notification: NotificationItem) => {
    const current = get().notifications;
    
    // Tránh trùng lặp thông báo nếu socket phát trùng hoặc reload
    if (current.some(n => n.id === notification.id)) {
      return;
    }

    const updated = [notification, ...current];
    const unreadCount = updated.filter(n => !n.read).length;
    set({ notifications: updated, unreadCount });
  },

  markAsRead: async (id: string) => {
    try {
      await userApi.markAsRead(id);
      
      const current = get().notifications;
      const updated = current.map(n => n.id === id ? { ...n, read: true } : n);
      const unreadCount = updated.filter(n => !n.read).length;
      
      set({ notifications: updated, unreadCount });
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  },

  markAllAsRead: async () => {
    try {
      await userApi.markAllAsRead();
      
      const current = get().notifications;
      const updated = current.map(n => ({ ...n, read: true }));
      
      set({ notifications: updated, unreadCount: 0 });
    } catch (error) {
      console.error('Failed to mark all notifications as read', error);
    }
  },
}));
