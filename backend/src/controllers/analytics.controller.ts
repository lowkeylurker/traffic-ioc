// Analytics Controller - Xử lý HTTP requests cho Analytics module

import { Request, Response, NextFunction } from 'express';
import { analyticsService } from '../services/analytics.service';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';

const logger = new Logger('AnalyticsController');

export class AnalyticsController {
  /**
   * GET /vehicle-mix - Lấy dữ liệu tỷ lệ phương tiện
   */
  async getVehicleMix(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /vehicle-mix');
      const data = await analyticsService.getVehicleMix();
      res.json(ResponseUtil.success(data, 'Vehicle mix data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /speed-comparison - Lấy dữ liệu so sánh tốc độ
   */
  async getSpeedComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /speed-comparison');
      const data = await analyticsService.getSpeedComparison();
      res.json(ResponseUtil.success(data, 'Speed comparison data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /reliability-ranking - Lấy bảng xếp hạng độ đáng tin cậy
   */
  async getReliabilityRanking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /reliability-ranking');
      const data = await analyticsService.getReliabilityRanking();
      res.json(ResponseUtil.success(data, 'Reliability ranking retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
