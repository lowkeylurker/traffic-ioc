// Incident Service (A2)
import { PrismaClient } from '@prisma/client';
import { IncidentFeature, IncidentQuery } from '../interfaces';

const prisma = new PrismaClient();

export class IncidentService {
  /**
   * Get all active incidents as GeoJSON FeatureCollection
   */
  async getIncidents(query: IncidentQuery): Promise<{ type: 'FeatureCollection'; features: IncidentFeature[] }> {
    const { status = 'OPEN', bbox } = query;

    let whereClause = `WHERE status = '${status}'`;

    // Add bbox filter if provided
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
      whereClause += ` AND ST_Intersects(
        geom,
        ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
      )`;
    }

    const sql = `
      SELECT 
        id,
        ST_X(geom) as lng,
        ST_Y(geom) as lat,
        type,
        severity,
        title,
        description,
        status,
        created_at
      FROM fact_incidents
      ${whereClause}
      ORDER BY created_at DESC
    `;

    const results = await prisma.$queryRawUnsafe<any[]>(sql);

    const features: IncidentFeature[] = results.map((row) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [row.lng, row.lat],
      },
      properties: {
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        status: row.status,
        timestamp: row.created_at.toISOString(),
      },
    }));

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  /**
   * Get incident by ID
   */
  async getIncidentById(id: string): Promise<IncidentFeature | null> {
    const sql = `
      SELECT 
        id,
        ST_X(geom) as lng,
        ST_Y(geom) as lat,
        type,
        severity,
        title,
        description,
        status,
        created_at
      FROM fact_incidents
      WHERE id = $1
    `;

    const results = await prisma.$queryRawUnsafe<any[]>(sql, id);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [row.lng, row.lat],
      },
      properties: {
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        status: row.status,
        timestamp: row.created_at.toISOString(),
      },
    };
  }

  /**
   * Create new incident
   */
  async createIncident(data: {
    coordinates: [number, number];
    type: string;
    severity: string;
    title: string;
    description: string;
    source?: string;
  }): Promise<IncidentFeature> {
    const [lng, lat] = data.coordinates;
    const sql = `
      INSERT INTO fact_incidents (geom, type, severity, title, description, source)
      VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3::incident_type, $4::incident_severity, $5, $6, $7)
      RETURNING 
        id,
        ST_X(geom) as lng,
        ST_Y(geom) as lat,
        type,
        severity,
        title,
        description,
        status,
        created_at
    `;

    const results = await prisma.$queryRawUnsafe<any[]>(
      sql,
      lng,
      lat,
      data.type,
      data.severity,
      data.title,
      data.description,
      data.source || 'ADMIN'
    );

    const row = results[0];
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [row.lng, row.lat],
      },
      properties: {
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        status: row.status,
        timestamp: row.created_at.toISOString(),
      },
    };
  }

  /**
   * Update incident status
   */
  async updateIncidentStatus(id: string, status: string): Promise<void> {
    const sql = `
      UPDATE fact_incidents
      SET status = $1::incident_status, updated_at = NOW()
      WHERE id = $2
    `;

    await prisma.$executeRawUnsafe(sql, status, id);
  }
}

export const incidentService = new IncidentService();
