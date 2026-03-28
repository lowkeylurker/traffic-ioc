// Analytics Controller - Xử lý HTTP requests cho Analytics module

import { NextFunction, Request, Response } from 'express';
import { ComparisonQuerySchema, CorridorDashboardQuerySchema, ReliabilityQuerySchema } from '../dtos';
import { AppError } from '../middlewares/error.middleware';
import { analyticsService } from '../services/analytics.service';
import { Logger } from '../utils/logger';
import { ResponseUtil } from '../utils/response';

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
   * GET /comparison - Lấy dữ liệu so sánh baseline/today theo metric trong 24 giờ
   */
  async getComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /comparison');

      const parsed = ComparisonQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid comparison query params', 'BAD_REQUEST');
      }

      const data = await analyticsService.getComparison(parsed.data);
      res.json(ResponseUtil.success(data, 'Comparison data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /corridors - Lấy danh sách hành lang giao thông
   */
  async getCorridorOptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /corridors');
      const data = await analyticsService.getCorridorOptions();
      res.json(ResponseUtil.success(data, 'Corridor options retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /corridor-dashboard - Lấy dữ liệu dashboard hành lang (MVP + nâng cao)
   */
  async getCorridorDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /corridor-dashboard');

      const parsed = CorridorDashboardQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid corridor dashboard query params', 'BAD_REQUEST');
      }

      const data = await analyticsService.getCorridorDashboard(parsed.data);
      res.json(ResponseUtil.success(data, 'Corridor dashboard data retrieved successfully'));
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

  /**
   * GET /reliability - Lấy dữ liệu mart reliability cho A4
   */
  async getReliability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /reliability');

      const parsed = ReliabilityQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(400, 'Invalid reliability query params', 'BAD_REQUEST');
      }

      const data = await analyticsService.getReliability(parsed.data);
      res.json(ResponseUtil.success(data, 'Reliability data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
