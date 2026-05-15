import { Router } from 'express';
import { olapController } from '../controllers/olap.controller';
import { adminOnly } from '../middlewares/admin.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.get('/heatmap', authMiddleware, adminOnly, (req, res, next) => olapController.getHeatmap(req, res, next));

router.get('/cross-analysis', authMiddleware, adminOnly, (req, res, next) =>
  olapController.getCrossAnalysis(req, res, next)
);

router.get('/drilldown', authMiddleware, adminOnly, (req, res, next) => olapController.getDrilldown(req, res, next));
router.get('/summary', authMiddleware, adminOnly, (req, res, next) => olapController.getSummary(req, res, next));
router.get('/district-ranking', authMiddleware, adminOnly, (req, res, next) => olapController.getDistrictRanking(req, res, next));
router.get('/road-type-comparison', authMiddleware, adminOnly, (req, res, next) => olapController.getRoadTypeComparison(req, res, next));

export default router;
