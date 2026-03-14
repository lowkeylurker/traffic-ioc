import { Router } from 'express';
import { weatherController } from '../controllers/weather.controller';

const router = Router();

/**
 * @route   GET /api/v1/weather/current
 * @desc    Lấy dữ liệu thời tiết mới nhất
 * @access  Public
 */
router.get('/current', weatherController.getCurrentWeather);

export default router;
