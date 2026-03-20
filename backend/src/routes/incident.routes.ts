import { Router } from 'express';
import { incidentController } from '../controllers/incident.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { upload } from '../config/cloudinary';

const router = Router();

/**
 * @route   GET /api/v1/incidents
 * @desc    Get verified incidents
 * @access  Public
 */
router.get('/', incidentController.getIncidents);

/**
 * @route   POST /api/v1/incidents/report
 * @desc    User report incident
 * @access  Private
 */
router.post(
    '/report',
    authMiddleware,
    upload.single('image'),
    incidentController.reportIncident
);

/**
 * @route   PATCH /api/v1/incidents/:incident_key/:date_key
 * @desc    Update incident (only reporter or admin)
 * @access  Private
 */
router.patch(
    '/:incident_key/:date_key',
    authMiddleware,
    incidentController.updateIncident
);

export default router;
