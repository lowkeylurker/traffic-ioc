import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { upload } from '../config/cloudinary.config';

const router = Router();

/**
 * @route   POST /api/v1/user/report
 * @desc    Báo cáo sự cố từ người dùng
 * @access  Public (Trong thực tế nên dùng authMiddleware)
 */
router.post('/report', upload.single('image'), (req, res, next) => userController.reportIncident(req, res, next));

/**
 * @route   GET /api/v1/user/news
 * @desc    Xem tin tức giao thông dựa trên vị trí
 * @access  Public
 */
router.get('/news', (req, res, next) => userController.getNews(req, res, next));

export default router;
