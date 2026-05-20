import { NextFunction, Request, Response } from 'express';
import { Notification } from '../models/notification.model';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';

const logger = new Logger('NotificationController');

export class NotificationController {
  /**
   * GET /api/v1/user/notifications
   * Lấy danh sách 50 thông báo gần nhất của người dùng hiện tại
   */
  async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).auth?.userId;
      if (!userId) {
        throw new AppError(401, 'Unauthorized: User identity not found', 'UNAUTHORIZED');
      }

      logger.log(`GET /notifications for user ${userId}`);

      const notifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50);

      res.json(ResponseUtil.success(notifications, 'Notifications retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/user/notifications/read-all
   * Đánh dấu đọc tất cả thông báo của người dùng hiện tại
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).auth?.userId;
      if (!userId) {
        throw new AppError(401, 'Unauthorized: User identity not found', 'UNAUTHORIZED');
      }

      logger.log(`PUT /notifications/read-all for user ${userId}`);

      await Notification.updateMany({ userId, read: false }, { $set: { read: true } });

      res.json(ResponseUtil.success(null, 'All notifications marked as read'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/user/notifications/:id/read
   * Đánh dấu đọc một thông báo cụ thể theo ID
   */
  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).auth?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new AppError(401, 'Unauthorized: User identity not found', 'UNAUTHORIZED');
      }

      logger.log(`PUT /notifications/${id}/read for user ${userId}`);

      const notification = await Notification.findOneAndUpdate(
        { _id: id, userId },
        { $set: { read: true } },
        { new: true }
      );

      if (!notification) {
        throw new AppError(404, 'Notification not found', 'NOT_FOUND');
      }

      res.json(ResponseUtil.success(notification, 'Notification marked as read'));
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
