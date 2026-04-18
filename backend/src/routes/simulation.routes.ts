// Routes cho Simulation module

import { Router } from 'express';
import { simulationController } from '../controllers/simulation.controller';

const router = Router();

/**
 * POST /api/v1/simulation/forecast
 * Dự báo tốc độ cho một đoạn đường
 * Body: { segmentId: number, horizonMinutes?: number }
 */
router.post('/forecast', (req, res, next) => simulationController.forecast(req, res, next));

/**
 * POST /api/v1/simulation/routing
 * Tìm lộ trình thay thế tránh các đoạn đường bị chặn
 * Body: { startPoint: [lon, lat], endPoint: [lon, lat], blockedSegments?: number[] }
 */
router.post('/routing', (req, res, next) => simulationController.routing(req, res, next));

/**
 * GET /api/v1/simulation/routes
 * Tìm lộ trình động (Dynamic Routing)
 * Query: startLat, startLng, endLat, endLng
 */
router.get('/routes', (req, res, next) => simulationController.dynamicRouting(req, res, next));

export default router;
