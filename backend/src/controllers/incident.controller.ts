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

}

export const incidentController = new IncidentController();
