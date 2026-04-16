// Incident Controller (A2)
import { NextFunction, Request, Response } from 'express';
import { incidentService } from '../services/incident.service';
import { Logger } from '../utils/logger';
import { ResponseUtil } from '../utils/response';

const logger = new Logger('IncidentController');
export class IncidentController {
  /**
   * GET /api/v1/incidents
   * Get all active incidents
   */
  async getIncidents(req: Request, res: Response) {
    try {
      const { status, bbox } = req.query;

      const incidents = await incidentService.getIncidents({
        status: status as any,
        bbox: bbox as string,
      });

      res.json(ResponseUtil.success(incidents, 'Incidents retrieved successfully'));
    } catch (error) {
      console.error('Error getting incidents:', error);
      res.json(ResponseUtil.error('Failed to get incidents', 500));
    }
  }

  /**
   * GET /api/v1/incidents/:id
   * Get incident by ID
   */
  async getIncidentById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const incident = await incidentService.getIncidentById(id);

      if (!incident) {
        return res.json(ResponseUtil.error('Incident not found', 404));
      }

      res.json(ResponseUtil.success(incident, 'Incident retrieved successfully'));
    } catch (error) {
      console.error('Error getting incident:', error);
      res.json(ResponseUtil.error('Failed to get incident', 500));
    }
  }

  /**
   * GET /api/v1/incidents/:id/impact-propagation
   * Get dynamic upstream impact propagation for selected incident
   */
  async getIncidentImpactPropagation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { radiusMeters, targetSpeedKmh, ttiThreshold, maxDepth, maxSegments } = req.query;

      if (!id || !/^\d+$/.test(id)) {
        return res.json(ResponseUtil.badRequest('incidentId must be a valid numeric id'));
      }

      const data = await incidentService.getImpactPropagation(id, {
        radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined,
        targetSpeedKmh: targetSpeedKmh !== undefined ? Number(targetSpeedKmh) : undefined,
        ttiThreshold: ttiThreshold !== undefined ? Number(ttiThreshold) : undefined,
        maxDepth: maxDepth !== undefined ? Number(maxDepth) : undefined,
        maxSegments: maxSegments !== undefined ? Number(maxSegments) : undefined,
      });

      res.json(ResponseUtil.success(data, 'Incident impact propagation retrieved successfully'));
    } catch (error) {
      logger.error('Error getting incident impact propagation', error);

      if (error instanceof Error && error.message === 'INCIDENT_NOT_FOUND') {
        return res.json(ResponseUtil.notFound('Incident not found'));
      }

      res.json(ResponseUtil.error('Failed to get incident impact propagation', 500));
    }
  }

  /**
   * POST /api/v1/incidents
   * Create new incident
   */
  async createIncident(req: Request, res: Response) {
    try {
      const { coordinates, type, severity, title, description, source } = req.body;

      if (!coordinates || !type || !title) {
        return res.json(ResponseUtil.error('Missing required fields', 400));
      }

      const incident = await incidentService.createIncident({
        coordinates,
        type,
        severity: severity || 'LOW',
        title,
        description: description || '',
        source,
      });

      res.json(ResponseUtil.success(incident, 'Incident created successfully', 201));
    } catch (error) {
      console.error('Error creating incident:', error);
      res.json(ResponseUtil.error('Failed to create incident', 500));
    }
  }

  /**
   * PATCH /api/v1/incidents/:id/status
   * Update incident status
   */
  async updateIncidentStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.json(ResponseUtil.error('Status is required', 400));
      }

      await incidentService.updateIncidentStatus(id, status);

      res.json(ResponseUtil.success(null, 'Incident status updated successfully'));
    } catch (error) {
      console.error('Error updating incident status:', error);
      res.json(ResponseUtil.error('Failed to update incident status', 500));
    }
  }

  /**
   * POST /api/v1/incidents/:id/confirm
   * Confirm/reject a citizen report based on user location (Gamification & Trust-based Auto Approval)
   */
  async confirmReport(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isTrue, userLng, userLat } = req.body;
      
      // Usually user ID comes from Auth Middleware (Clerk/authMiddleware).
      // Make sure its available from the req object
      const userId = req.body.userId || 'demo_user_id';

      if (!userId || typeof isTrue !== 'boolean' || userLng === undefined || userLat === undefined) {
        return res.json(ResponseUtil.error('Missing required fields (userId, isTrue, userLng, userLat)', 400));
      }

      const result = await incidentService.confirmCitizenReport(id, userId, isTrue, Number(userLng), Number(userLat));
      res.json(ResponseUtil.success(result, result.message));
    } catch (error) {
      console.error('Error confirming report:', error);
      if (error instanceof Error && error.message.includes('200m')) {
        return res.json(ResponseUtil.error(error.message, 403));
      }
      res.json(ResponseUtil.error('Failed to confirm report', 500));
    }
  }
}

export const incidentController = new IncidentController();
