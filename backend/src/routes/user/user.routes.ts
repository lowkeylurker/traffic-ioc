import { Router } from 'express';
import { userIncidentController } from '../../controllers/user/user-incident.controller';
import { adminOnly } from '../../middlewares/admin.middleware';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { reportRateLimit } from '../../middlewares/rate-limit/report-rate-limit.middleware';
import { imageUpload } from '../../middlewares/upload/image-upload.middleware';

const router = Router();

// GET /api/v1/user/news?lat=...&long=...&radius=...
router.get('/news', (req, res, next) => userIncidentController.getNews(req, res, next));

// GET /api/v1/user/score
router.get('/score', authMiddleware, (req, res, next) => userIncidentController.getScore(req, res, next));

// POST /api/v1/user/report
router.post('/report', authMiddleware, reportRateLimit, imageUpload.single('image'), (req, res, next) =>
  userIncidentController.submitReport(req, res, next)
);

// PATCH /api/v1/user/report/:id (owner only, pending only)
router.patch('/report/:id', authMiddleware, imageUpload.single('image'), (req, res, next) =>
  userIncidentController.updateOwnReport(req, res, next)
);

// GET /api/v1/user/reports/me (owner reports)
router.get('/reports/me', authMiddleware, (req, res, next) => userIncidentController.getOwnReports(req, res, next));

// GET /api/v1/user/reports (admin moderation list)
router.get('/reports', authMiddleware, adminOnly, (req, res, next) =>
  userIncidentController.getReportsForAdmin(req, res, next)
);

// PATCH /api/v1/user/report/:id/status (admin moderation)
router.patch('/report/:id/status', authMiddleware, adminOnly, (req, res, next) =>
  userIncidentController.moderateReport(req, res, next)
);

export default router;
