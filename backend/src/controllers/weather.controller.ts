// Weather Controller - Xử lý HTTP requests cho Weather module

import { NextFunction, Request, Response } from 'express';
import { weatherService } from '../services/weather.service';
import { Logger } from '../utils/logger';
import { ResponseUtil } from '../utils/response';

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

  /**
   * GET /api/v1/weather/segments - Lấy danh sách segment với dữ liệu thời tiết
   */
  async getWeatherSegments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /api/v1/weather/segments');
      const weatherSegments = await weatherService.getWeatherSegments();

      res.json(ResponseUtil.success(weatherSegments, 'Weather segments retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const weatherController = new WeatherController();
