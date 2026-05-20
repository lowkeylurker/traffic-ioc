import { NextFunction, Request, Response } from 'express';
import { HistoryExportQuerySchema, HistoryQuerySchema } from '../dtos';
import { AppError } from '../middlewares/error.middleware';
import { historyService } from '../services/history.service';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';

const logger = new Logger('HistoryController');

export class HistoryController {
  /**
   * GET /api/v1/history
   * Tra cứu lịch sử với phân trang
   */
  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /history');

      const parsed = HistoryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid history query params', 'BAD_REQUEST');
      }

      const data = await historyService.getHistory(parsed.data);
      res.json(ResponseUtil.success(data, 'History data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/history/export
   * Xuất CSV bằng streaming
   */
  async exportHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /history/export');

      const parsed = HistoryExportQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid history export params', 'BAD_REQUEST');
      }

      await historyService.streamHistoryCsv(parsed.data, res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/history/hotspots
   * Lấy top các điểm nóng trên toàn bộ dữ liệu đã lọc
   */
  async getHotspots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /history/hotspots');

      const parsed = HistoryExportQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid history hotspots params', 'BAD_REQUEST');
      }

      const hotspots = await historyService.getTopHotspots(parsed.data, 8);
      res.json(ResponseUtil.success(hotspots, 'History hotspots retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/history/summary
   * Lấy tổng hợp xu hướng và các chỉ số thống kê
   */
  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /history/summary');

      const parsed = HistoryExportQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid history summary params', 'BAD_REQUEST');
      }

      const summary = await historyService.getHistorySummary(parsed.data);
      res.json(ResponseUtil.success(summary, 'History summary retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/history/export/async
   * Yêu cầu xuất dữ liệu lịch sử không đồng bộ (qua background job + gửi mail)
   */
  async requestAsyncExport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('POST /history/export/async');

      const parsed = HistoryExportQuerySchema.safeParse(req.body.exportParams);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid history export params', 'BAD_REQUEST');
      }

      const email = req.body.email as string;
      const auth = typeof (req as any).auth === 'function' ? (req as any).auth() : (req as any).auth;
      const userId = auth?.userId || req.body.userId || 'guest_admin';

      if (!email) {
        throw new AppError(400, 'Receiver email address is required', 'BAD_REQUEST');
      }

      // Enqueue job vào BullMQ csvExportQueue
      const { csvExportQueue } = await import('../jobs/csvExportQueue');
      const job = await csvExportQueue.add('exportHistoryCsv', {
        userId,
        email,
        exportParams: parsed.data,
      });

      logger.log(`✓ Enqueued CSV Export Job #${job.id} for user ${userId} (${email})`);

      res.status(202).json(ResponseUtil.success(
        { jobId: job.id },
        'Yêu cầu xuất dữ liệu đã được tiếp nhận và xử lý trong background'
      ));
    } catch (error) {
      next(error);
    }
  }
}

export const historyController = new HistoryController();
