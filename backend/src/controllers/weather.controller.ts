import { Request, Response, NextFunction } from 'express';
import { weatherService } from '../services/weather.service';
import { HTTP_STATUS, RESPONSE_MESSAGES } from '../constants/messages';

export class WeatherController {
    /**
     * GET /api/v1/weather/current
     */
    async getCurrentWeather(req: Request, res: Response, next: NextFunction) {
        try {
            const weather = await weatherService.getCurrentWeather();

            if (!weather) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    message: RESPONSE_MESSAGES.NOT_FOUND,
                });
            }

            return res.status(HTTP_STATUS.OK).json({
                success: true,
                data: weather,
            });
        } catch (error) {
            next(error);
        }
    }
}

export const weatherController = new WeatherController();
