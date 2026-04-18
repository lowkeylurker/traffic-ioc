// Simulation Controller - Xử lý HTTP requests cho Simulation module

import { Request, Response, NextFunction } from 'express';
import { simulationService } from '../services/simulation.service';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';
import { ForecastDto, RoutingDto } from '../dtos/index';

const logger = new Logger('SimulationController');

export class SimulationController {
  /**
   * POST /forecast - Dự báo tốc độ
   * Body: { segmentId: number, horizonMinutes?: number }
   */
  async forecast(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('POST /forecast', req.body);

      const { segmentId, horizonMinutes } = req.body as ForecastDto;

      // Validate
      if (!segmentId) {
        res.status(400).json(ResponseUtil.badRequest('segmentId is required'));
        return;
      }

      const forecast = await simulationService.forecast({
        segmentId,
        horizonMinutes,
      });

      res.status(201).json(ResponseUtil.created(forecast, 'Forecast generated successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /routing - Tìm lộ trình thay thế
   * Body: { startPoint: [lon, lat], endPoint: [lon, lat], blockedSegments?: number[] }
   */
  async routing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('POST /routing', req.body);

      const { startPoint, endPoint, blockedSegments } = req.body as RoutingDto;

      // Validate
      if (!startPoint || !endPoint) {
        res.status(400).json(ResponseUtil.badRequest('startPoint and endPoint are required'));
        return;
      }

      const route = await simulationService.routing({
        startPoint,
        endPoint,
        blockedSegments,
      });

      res.status(201).json(ResponseUtil.created(route, 'Route computed successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /routes - Tìm lộ trình động (Dynamic Routing)
   * Query: startLat, startLng, endLat, endLng
   */
  async dynamicRouting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /routes', req.query);
      const { startLat, startLng, endLat, endLng } = req.query;

      if (!startLat || !startLng || !endLat || !endLng) {
        res.status(400).json(ResponseUtil.badRequest('Missing start/end coordinates'));
        return;
      }

      const route = await simulationService.getDynamicRoute(
        parseFloat(startLat as string),
        parseFloat(startLng as string),
        parseFloat(endLat as string),
        parseFloat(endLng as string)
      );

      res.status(200).json(ResponseUtil.success(route, 'Dynamic route computed'));
    } catch (error) {
      next(error);
    }
  }
}

export const simulationController = new SimulationController();
