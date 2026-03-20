import { Router } from 'express';
import { incidentController } from '../controllers/incident.controller';

const router = Router();

/**
 * GET /api/v1/incidents
 * get list incident OPEN from view_active_incidents
 * return GeoJSON FeatureCollection
 */
router.get('/', incidentController.getActiveIncidents);

// GET /api/v1/incidents - Get all incidents
router.get('/', incidentController.getIncidents.bind(incidentController));

// GET /api/v1/incidents/:id - Get incident by ID
router.get('/:id', incidentController.getIncidentById.bind(incidentController));

// POST /api/v1/incidents - Create new incident
router.post('/', incidentController.createIncident.bind(incidentController));

// PATCH /api/v1/incidents/:id/status - Update incident status
router.patch('/:id/status', incidentController.updateIncidentStatus.bind(incidentController));

export default router;
