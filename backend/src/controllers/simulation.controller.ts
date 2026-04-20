// Simulation Controller - Xử lý HTTP requests cho Simulation module

import { Request, Response, NextFunction } from 'express';
import { simulationService } from '../services/simulation.service';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';
import { ForecastDto, RoutingDto } from '../dtos/index';

const logger = new Logger('SimulationController');

export class SimulationController {
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
}

export const simulationController = new SimulationController();
