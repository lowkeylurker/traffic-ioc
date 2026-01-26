// Routes cho Map module

import { Router } from 'express';
import { mapController } from '../controllers/map.controller';

const router = Router();

/**
 * GET /api/v1/map/segments
 * Lấy danh sách tất cả đoạn đường (GeoJSON)
 */
router.get('/segments', (req, res, next) => mapController.getSegments(req, res, next));

/**
 * GET /api/v1/map/status
 * Lấy trạng thái giao thông hiện tại của tất cả đoạn đường
 */
router.get('/status', (req, res, next) => mapController.getTrafficStatus(req, res, next));

/**
 * GET /api/v1/map/status/:segmentId
 * Lấy trạng thái của một đoạn đường cụ thể
 */
router.get('/status/:segmentId', (req, res, next) => mapController.getSegmentStatus(req, res, next));

export default router;
