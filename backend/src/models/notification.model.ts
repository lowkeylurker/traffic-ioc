import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true, default: 'general' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, required: true, default: false, index: true },
  },
  {
    timestamps: true, // Tự động quản lý createdAt (chính là timestamp thông báo) và updatedAt
    collection: 'notifications',
  }
);

// Tạo compound index phục vụ truy vấn thông báo chưa đọc của user cực nhanh
NotificationSchema.index({ userId: 1, read: 1 });
NotificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model<INotification>(
  'Notification',
  NotificationSchema
);
