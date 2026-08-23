import { Router } from 'express';
import { searchController } from '../controllers/search.controller';

const router = Router();

// GET /api/search/places?q=...
router.get('/places', (req, res, next) => searchController.searchPlaces(req, res, next));

export default router;
