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
}

export const historyController = new HistoryController();
