import { Request, Response, NextFunction } from 'express';
import { query } from '../config/db';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';

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
                    createdAt: row.created_at
                }
            }));

            const featureCollection = {
                type: 'FeatureCollection',
                features
            };

            res.json(ResponseUtil.success(featureCollection, 'Active incidents retrieved successfully'));
        } catch (error) {
            logger.error('Error fetching incidents', error);
            next(error);
        }
    }
}

export const incidentController = new IncidentController();
