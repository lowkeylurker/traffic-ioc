// Routes cho Analytics module

import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';

const router = Router();

/**
 * GET /api/v1/analytics/vehicle-mix
 * Lấy dữ liệu tỷ lệ phương tiện (biểu đồ tròn)
 */
router.get('/vehicle-mix', (req, res, next) => analyticsController.getVehicleMix(req, res, next));

/**
 * GET /api/v1/analytics/speed-comparison
 * Lấy dữ liệu so sánh tốc độ hiện tại vs baseline
 */
router.get('/speed-comparison', (req, res, next) => analyticsController.getSpeedComparison(req, res, next));

/**
 * GET /api/v1/analytics/reliability-ranking
 * Lấy bảng xếp hạng Top 10 đoạn đường có Buffer Index cao nhất
 */
router.get('/reliability-ranking', (req, res, next) => analyticsController.getReliabilityRanking(req, res, next));

export default router;
