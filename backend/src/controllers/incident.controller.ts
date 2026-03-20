// Incident Controller (A2)
import { NextFunction, Request, Response } from 'express';
import { query } from '../config/db';
import { incidentService } from '../services/incident.service';
import { Logger } from '../utils/logger';
import { ResponseUtil } from '../utils/response';

const logger = new Logger('IncidentController');
export class IncidentController {
  /**
   * GET /api/v1/incidents
   * get list incident OPEN from view_active_incidents
   * return GeoJSON FeatureCollection
   */
  async getActiveIncidents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('Fetching active incidents');

      const result = await query(`
        SELECT
          id,
          type,
          severity,
          description,
          status,
          created_at,
          geojson_point::json as geometry
        FROM view_active_incidents
        WHERE status = 'OPEN'
        ORDER BY created_at DESC
      `);

      // convert to GeoJSON FeatureCollection
      const features = result.rows.map((row) => ({
        type: 'Feature',
        id: row.id,
        geometry: row.geometry,
        properties: {
          id: row.id,
          type: row.type,
          severity: row.severity,
          description: row.description,
          status: row.status,
          createdAt: row.created_at,
        },
      }));

      const featureCollection = {
        type: 'FeatureCollection',
        features,
      };

      res.json(ResponseUtil.success(featureCollection, 'Active incidents retrieved successfully'));
    } catch (error) {
      logger.error('Error fetching incidents', error);
      next(error);
    }
  }
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
}

export const incidentController = new IncidentController();
