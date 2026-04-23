import { Router } from 'express';
import { trafficController } from '../controllers/traffic.controller';

const router = Router();

// GET /api/traffic/tiles/:z/:x/:y.pbf
router.get('/tiles/:z/:x/:y.pbf', (req, res, next) => trafficController.getFlowTile(req, res, next));

export default router;
