// Weather Controller - Xử lý HTTP requests cho Weather module

import { Request, Response, NextFunction } from 'express';
import { weatherService } from '../services/weather.service';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';

const logger = new Logger('WeatherController');

export class WeatherController {
  /**
   * GET /api/v1/weather/current - Lấy thông tin thời tiết mới nhất
   */
  async getCurrentWeather(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /api/v1/weather/current');
      const weather = await weatherService.getCurrentWeather();

      if (!weather) {
        res.status(404).json(ResponseUtil.notFound('Weather data not found'));
        return;
      }

      res.json(ResponseUtil.success(weather, 'Weather data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const weatherController = new WeatherController();
