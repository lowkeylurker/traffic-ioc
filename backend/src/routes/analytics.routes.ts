// Routes cho Analytics module

import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { adminOnly } from '../middlewares/admin.middleware';

const router = Router();

/**
 * GET /api/v1/analytics/vehicle-mix
 * Lấy dữ liệu tỷ lệ phương tiện (biểu đồ tròn)
 */
router.get('/vehicle-mix', authMiddleware, adminOnly, (req, res, next) =>
  analyticsController.getVehicleMix(req, res, next)
);

/**
 * GET /api/v1/analytics/speed-comparison
 * Lấy dữ liệu so sánh tốc độ hiện tại vs baseline
 */
router.get('/speed-comparison', authMiddleware, adminOnly, (req, res, next) =>
  analyticsController.getSpeedComparison(req, res, next)
);

/**
 * GET /api/v1/analytics/reliability-ranking
 * Lấy bảng xếp hạng Top 10 đoạn đường có Buffer Index cao nhất
 */
router.get('/reliability-ranking', authMiddleware, adminOnly, (req, res, next) =>
  analyticsController.getReliabilityRanking(req, res, next)
);

export default router;
