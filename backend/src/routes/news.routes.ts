import { Router } from 'express';
import { newsController } from '../controllers/news.controller';

const router = Router();

// GET /api/v1/news/ticker
router.get('/ticker', newsController.getLatestNews);

export default router;
