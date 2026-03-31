import { Router } from 'express';
import { incidentController } from '../controllers/incident.controller';
import { adminOnly } from '../middlewares/admin.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/v1/incidents - Get all incidents
router.get('/', incidentController.getIncidents.bind(incidentController));

// GET /api/v1/incidents/:id/impact-propagation - Get dynamic impact propagation
router.get('/:id/impact-propagation', incidentController.getIncidentImpactPropagation.bind(incidentController));

// GET /api/v1/incidents/:id - Get incident by ID
router.get('/:id', incidentController.getIncidentById.bind(incidentController));

// POST /api/v1/incidents - Create new incident
router.post('/', incidentController.createIncident.bind(incidentController));

// PATCH /api/v1/incidents/:id/status - Update incident status
router.patch(
  '/:id/status',
  authMiddleware,
  adminOnly,
  incidentController.updateIncidentStatus.bind(incidentController)
);

export default router;
