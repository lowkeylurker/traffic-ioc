// Incident Service (A2)
import { Prisma, PrismaClient } from '@prisma/client';
import { IncidentFeature, IncidentQuery } from '../interfaces';

const prisma = new PrismaClient();

const severityToLabel = (severityLevel: number | null | undefined): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' => {
  if (!severityLevel || severityLevel <= 1) return 'LOW';
  if (severityLevel === 2) return 'MEDIUM';
  if (severityLevel === 3) return 'HIGH';
  return 'CRITICAL';
};

const labelToSeverity = (severity: string | undefined): number => {
  switch ((severity || '').toUpperCase()) {
    case 'CRITICAL':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    default:
      return 1;
  }
};

const toIncidentType = (
  incidentType: string | null | undefined
): 'ACCIDENT' | 'FLOOD' | 'CONGESTION' | 'CONSTRUCTION' | 'FIRE' | 'OTHER' => {
  switch ((incidentType || '').toUpperCase()) {
    case 'ACCIDENT':
    case 'FLOOD':
    case 'CONGESTION':
    case 'CONSTRUCTION':
    case 'FIRE':
      return incidentType!.toUpperCase() as 'ACCIDENT' | 'FLOOD' | 'CONGESTION' | 'CONSTRUCTION' | 'FIRE';
    default:
      return 'OTHER';
  }
};

const buildTitle = (incidentType: string | null | undefined, severityLevel: number | null | undefined): string => {
  const typeLabel = toIncidentType(incidentType);
  const severityLabel = severityToLabel(severityLevel);
  return `${typeLabel} - ${severityLabel}`;
};

const buildDescription = (incidentType: string | null | undefined, delaySeconds: number | null | undefined): string => {
  const typeLabel = toIncidentType(incidentType);
  if (!delaySeconds || delaySeconds <= 0) {
    return `Su co ${typeLabel.toLowerCase()}`;
  }
  return `Su co ${typeLabel.toLowerCase()} gay tre ${delaySeconds} giay`;
};

export class IncidentService {
  /**
   * Get all active incidents as GeoJSON FeatureCollection
   */
  async getIncidents(query: IncidentQuery): Promise<{ type: 'FeatureCollection'; features: IncidentFeature[] }> {
    const { status = 'OPEN', bbox } = query;

    const whereClauses: Prisma.Sql[] = [];

    if (status) {
      const isActive = String(status).toUpperCase() === 'OPEN';
      whereClauses.push(Prisma.sql`is_active = ${isActive}`);
    }

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
      if ([minLng, minLat, maxLng, maxLat].every((v) => Number.isFinite(v))) {
        whereClauses.push(
          Prisma.sql`ST_Intersects(
            geometry,
            ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
          )`
        );
      }
    }

    const whereSql = whereClauses.length > 0 ? Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}` : Prisma.empty;

    const results = await prisma.$queryRaw<
      Array<{
        incident_key: bigint;
        lng: number;
        lat: number;
        incident_type: string | null;
        severity_level: number | null;
        delay_seconds: number | null;
        is_active: boolean | null;
        timestamp: Date;
      }>
    >(Prisma.sql`
      SELECT
        incident_key,
        ST_X(geometry) as lng,
        ST_Y(geometry) as lat,
        incident_type,
        severity_level,
        delay_seconds,
        is_active,
        timestamp
      FROM fact_incident
      ${whereSql}
      ORDER BY timestamp DESC
    `);

    const features: IncidentFeature[] = results.map((row) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [row.lng, row.lat],
      },
      properties: {
        id: row.incident_key.toString(),
        type: toIncidentType(row.incident_type),
        severity: severityToLabel(row.severity_level),
        title: buildTitle(row.incident_type, row.severity_level),
        description: buildDescription(row.incident_type, row.delay_seconds),
        status: row.is_active ? 'OPEN' : 'RESOLVED',
        timestamp: row.timestamp.toISOString(),
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
    const incidentKey = BigInt(id);

    const results = await prisma.$queryRaw<
      Array<{
        incident_key: bigint;
        lng: number;
        lat: number;
        incident_type: string | null;
        severity_level: number | null;
        delay_seconds: number | null;
        is_active: boolean | null;
        timestamp: Date;
      }>
    >(Prisma.sql`
      SELECT
        incident_key,
        ST_X(geometry) as lng,
        ST_Y(geometry) as lat,
        incident_type,
        severity_level,
        delay_seconds,
        is_active,
        timestamp
      FROM fact_incident
      WHERE incident_key = ${incidentKey}
      ORDER BY timestamp DESC
      LIMIT 1
    `);

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
        id: row.incident_key.toString(),
        type: toIncidentType(row.incident_type),
        severity: severityToLabel(row.severity_level),
        title: buildTitle(row.incident_type, row.severity_level),
        description: buildDescription(row.incident_type, row.delay_seconds),
        status: row.is_active ? 'OPEN' : 'RESOLVED',
        timestamp: row.timestamp.toISOString(),
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
    const incidentType = toIncidentType(data.type);
    const severityLevel = labelToSeverity(data.severity);

    const results = await prisma.$queryRaw<
      Array<{
        incident_key: bigint;
        lng: number;
        lat: number;
        incident_type: string | null;
        severity_level: number | null;
        delay_seconds: number | null;
        is_active: boolean | null;
        timestamp: Date;
      }>
    >(Prisma.sql`
      WITH base AS (
        SELECT
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) AS geom,
          NOW() AS ts
      ), next_key AS (
        SELECT COALESCE(MAX(incident_key), 0) + 1 AS incident_key
        FROM fact_incident
      ), nearest_segment AS (
        SELECT s.segment_key, s.location_key
        FROM dim_segment s, base b
        WHERE s.geometry_center IS NOT NULL
        ORDER BY s.geometry_center <-> b.geom
        LIMIT 1
      ), time_lookup AS (
        SELECT t.time_key
        FROM dim_time_of_day t, base b
        ORDER BY ABS(COALESCE(t.hhmm, 0) - ((EXTRACT(HOUR FROM b.ts)::int * 100) + EXTRACT(MINUTE FROM b.ts)::int))
        LIMIT 1
      ), payload AS (
        SELECT
          nk.incident_key,
          COALESCE(tl.time_key, (SELECT time_key FROM dim_time_of_day ORDER BY time_key LIMIT 1)) AS time_key,
          TO_CHAR(b.ts, 'YYYYMMDD')::int AS date_key,
          COALESCE(ns.segment_key, (SELECT segment_key FROM dim_segment ORDER BY segment_key LIMIT 1)) AS segment_key,
          ns.location_key,
          ${incidentType}::varchar(50) AS incident_type,
          b.ts AS timestamp,
          ${severityLevel}::smallint AS severity_level,
          0::int AS delay_seconds,
          b.geom AS geometry,
          FALSE AS is_simulated,
          TRUE AS is_active,
          NOW() AS inserted_at,
          1::smallint AS quality_flag
        FROM base b
        CROSS JOIN next_key nk
        LEFT JOIN nearest_segment ns ON TRUE
        LEFT JOIN time_lookup tl ON TRUE
      )
      INSERT INTO fact_incident (
        incident_key,
        time_key,
        date_key,
        segment_key,
        location_key,
        incident_type,
        timestamp,
        severity_level,
        delay_seconds,
        geometry,
        is_simulated,
        is_active,
        inserted_at,
        quality_flag
      )
      SELECT
        incident_key,
        time_key,
        date_key,
        segment_key,
        location_key,
        incident_type,
        timestamp,
        severity_level,
        delay_seconds,
        geometry,
        is_simulated,
        is_active,
        inserted_at,
        quality_flag
      FROM payload
      RETURNING
        incident_key,
        ST_X(geometry) as lng,
        ST_Y(geometry) as lat,
        incident_type,
        severity_level,
        delay_seconds,
        is_active,
        timestamp
    `);

    const row = results[0];
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [row.lng, row.lat],
      },
      properties: {
        id: row.incident_key.toString(),
        type: toIncidentType(row.incident_type),
        severity: severityToLabel(row.severity_level),
        title: data.title || buildTitle(row.incident_type, row.severity_level),
        description: data.description || buildDescription(row.incident_type, row.delay_seconds),
        status: row.is_active ? 'OPEN' : 'RESOLVED',
        timestamp: row.timestamp.toISOString(),
      },
    };
  }

  /**
   * Update incident status
   */
  async updateIncidentStatus(id: string, status: string): Promise<void> {
    const incidentKey = BigInt(id);
    const isActive = status.toUpperCase() === 'OPEN';

    await prisma.$executeRaw(Prisma.sql`
      UPDATE fact_incident
      SET is_active = ${isActive}, inserted_at = NOW()
      WHERE incident_key = ${incidentKey}
    `);
  }
}

export const incidentService = new IncidentService();
