import { Router } from 'express';
import { incidentController } from '../controllers/incident.controller';

const router = Router();

/**
 * GET /api/v1/incidents
 * get list incident OPEN from view_active_incidents
 * return GeoJSON FeatureCollection
 */
router.get('/', incidentController.getActiveIncidents);

export default router;