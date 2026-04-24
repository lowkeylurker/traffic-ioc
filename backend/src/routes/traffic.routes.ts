import { Router } from 'express';
import { trafficController } from '../controllers/traffic.controller';

const router = Router();

// GET /api/traffic/segment-detail?lat=...&lng=...
router.get('/segment-detail', (req, res, next) => trafficController.getSegmentDetail(req, res, next));

// GET /api/traffic/tiles/:z/:x/:y.pbf
router.get('/tiles/:z/:x/:y.pbf', (req, res, next) => trafficController.getFlowTile(req, res, next));

// GET /api/traffic/incidents/:z/:x/:y.pbf
router.get('/incidents/:z/:x/:y.pbf', (req, res, next) => trafficController.getIncidentTile(req, res, next));

export default router;
