import { Router } from 'express';
import { olapController } from '../controllers/olap.controller';
import { adminOnly } from '../middlewares/admin.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.get('/districts', authMiddleware, adminOnly, (req, res, next) => olapController.getDistricts(req, res, next));

/**
 * GET /api/v1/olap/analyze
 * OLAP endpoint cho heatmap/scatter/drilldown (đọc từ data mart).
 */
router.get('/analyze', authMiddleware, adminOnly, (req, res, next) => olapController.analyze(req, res, next));

export default router;
