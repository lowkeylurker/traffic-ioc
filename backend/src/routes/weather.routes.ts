// Routes cho Weather module

import { Router } from 'express';
import { weatherController } from '../controllers/weather.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

/**
 * GET /api/v1/weather/current
 * Lấy thông tin thời tiết mới nhất
 */
router.get('/current', authMiddleware, (req, res, next) => weatherController.getCurrentWeather(req, res, next));

export default router;
