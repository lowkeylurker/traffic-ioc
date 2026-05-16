import { Router } from 'express';
import { incidentController } from '../controllers/incident.controller';
import { adminOnly } from '../middlewares/admin.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/v1/incidents - Get all incidents
router.get('/', incidentController.getIncidents.bind(incidentController));

// GET /api/v1/incidents/:id/impact-propagation - Get dynamic impact propagation
router.get('/:id/impact-propagation', incidentController.getIncidentImpactPropagation.bind(incidentController));

// PATCH /api/v1/incidents/:id/status - Update incident status
// (Removed unused endpoints: GET /:id, POST /)

export default router;
