// Routes cho Map module

import { Router } from 'express';
import { mapController } from '../controllers/map.controller';

const router = Router();

/**
 * GET /api/v1/map/segments
 * Lấy bản đồ giao thông với mã màu (GeoJSON)
 */
router.get('/segments', (req, res, next) => mapController.getTrafficMap(req, res, next));

/**
 * GET /api/v1/map/roads
 * Lấy danh sách tuyến đường cho filter analytics theo road
 */
router.get('/roads', (req, res, next) => mapController.getRoads(req, res, next));

/**
 * GET /api/v1/map/status
 * Lấy trạng thái giao thông hiện tại của tất cả đoạn đường
 */
router.get('/status', (req, res, next) => mapController.getTrafficStatus(req, res, next));

/**
 * GET /api/v1/map/status/snapshots
 * Lấy danh sách mốc giờ có dữ liệu traffic
 */
router.get('/status/snapshots', (req, res, next) => mapController.getTrafficStatusSnapshots(req, res, next));


export default router;
