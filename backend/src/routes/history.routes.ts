import { Router } from 'express';
import { historyController } from '../controllers/history.controller';
import { adminOnly } from '../middlewares/admin.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

/**
 * GET /api/v1/history
 * Tra cứu lịch sử có phân trang
 */
router.get('/', authMiddleware, adminOnly, (req, res, next) => historyController.getHistory(req, res, next));

/**
 * GET /api/v1/history/export
 * Export CSV theo stream
 */
router.get('/export', authMiddleware, adminOnly, (req, res, next) => historyController.exportHistory(req, res, next));

/**
 * GET /api/v1/history/hotspots
 * Lấy top điểm nóng trên toàn bộ dữ liệu đã lọc
 */
router.get('/hotspots', authMiddleware, adminOnly, (req, res, next) => historyController.getHotspots(req, res, next));

/**
 * GET /api/v1/history/summary
 * Lấy tổng hợp xu hướng và các chỉ số thống kê
 */
router.get('/summary', authMiddleware, adminOnly, (req, res, next) => historyController.getSummary(req, res, next));

export default router;
