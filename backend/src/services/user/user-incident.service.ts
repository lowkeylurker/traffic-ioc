import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

type ReportStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'RESOLVED';

type IncidentType = 'ACCIDENT' | 'FLOOD' | 'CONGESTION';

const ALLOWED_INCIDENT_TYPES: IncidentType[] = ['ACCIDENT', 'FLOOD', 'CONGESTION'];
const ALLOWED_MODERATION_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  PENDING: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['RESOLVED'],
  REJECTED: [],
  RESOLVED: [],
};

const clampRadiusKm = (radius?: number): number => {
  if (!Number.isFinite(radius as number)) {
    return 5;
  }

  return Math.min(10, Math.max(1, Number(radius)));
};

const normalizeType = (type: string): IncidentType => {
  const normalized = type?.toUpperCase() as IncidentType;
  if (!ALLOWED_INCIDENT_TYPES.includes(normalized)) {
    throw new Error('Invalid incident type. Allowed values: ACCIDENT, FLOOD, CONGESTION');
  }

  return normalized;
};

const normalizeStatus = (status: string): ReportStatus => {
  const normalized = status?.toUpperCase() as ReportStatus;
  if (!['PENDING', 'VERIFIED', 'REJECTED', 'RESOLVED'].includes(normalized)) {
    throw new Error('Invalid status. Allowed values: PENDING, VERIFIED, REJECTED, RESOLVED');
  }

  return normalized;
};

const validateCoordinates = (lat: number, lng: number): void => {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error('Invalid latitude');
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('Invalid longitude');
  }
};

export interface UserNewsItem {
  incidentId: string;
  incidentType: string;
  roadName: string;
  occurredAt: string;
  imageUrl: string | null;
  distanceKm: number;
  location: {
    lat: number;
    long: number;
  };
}

export class UserIncidentService {
  async getNews(lat: number, lng: number, radiusKm?: number): Promise<UserNewsItem[]> {
    validateCoordinates(lat, lng);

    const safeRadiusKm = clampRadiusKm(radiusKm);

    const rows = await prisma.$queryRaw<
      Array<{
        incident_key: bigint;
        incident_type: string | null;
        timestamp: Date;
        image_url: string | null;
        lng: number;
        lat: number;
        distance_km: number;
        road_name: string | null;
      }>
    >(Prisma.sql`
      WITH user_point AS (
        SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) AS geom
      )
      SELECT
        fi.incident_key,
        fi.incident_type,
        fi.timestamp,
        fi.image_url,
        ST_X(fi.geometry) AS lng,
        ST_Y(fi.geometry) AS lat,
        ROUND((ST_DistanceSphere(fi.geometry, up.geom) / 1000.0)::numeric, 3)::float8 AS distance_km,
        COALESCE(dr.name, CONCAT('Segment ', fi.segment_key::text)) AS road_name
      FROM fact_incident fi
      CROSS JOIN user_point up
      LEFT JOIN dim_segment ds ON ds.segment_key = fi.segment_key
      LEFT JOIN dim_way dw ON dw.way_key = ds.way_key
      LEFT JOIN dim_road dr ON dr.road_key = dw.road_key
      WHERE fi.geometry IS NOT NULL
        AND fi.status = 'VERIFIED'::incident_status
        AND ST_DWithin(fi.geometry::geography, up.geom::geography, ${safeRadiusKm} * 1000)
      ORDER BY fi.timestamp DESC
      LIMIT 200
    `);

    return rows.map((row) => ({
      incidentId: row.incident_key.toString(),
      incidentType: row.incident_type || 'OTHER',
      roadName: row.road_name || 'Unknown road',
      occurredAt: row.timestamp.toISOString(),
      imageUrl: row.image_url,
      distanceKm: row.distance_km,
      location: {
        lat: row.lat,
        long: row.lng,
      },
    }));
  }

  async submitReport(input: {
    reporterId: string;
    incidentType: string;
    lat: number;
    lng: number;
    description?: string;
    imageUrl?: string | null;
  }): Promise<{ reportId: string; status: ReportStatus }> {
    if (!input.reporterId) {
      throw new Error('Reporter ID is required');
    }

    validateCoordinates(input.lat, input.lng);

    const incidentType = normalizeType(input.incidentType);
    const description = input.description?.trim() || null;

    const rows = await prisma.$queryRaw<Array<{ incident_key: bigint; status: ReportStatus }>>(Prisma.sql`
      WITH base AS (
        SELECT
          ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326) AS geom,
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
      ), nearest_time AS (
        SELECT t.time_key
        FROM dim_time_of_day t, base b
        ORDER BY ABS(COALESCE(t.hhmm, 0) - ((EXTRACT(HOUR FROM b.ts)::int * 100) + EXTRACT(MINUTE FROM b.ts)::int))
        LIMIT 1
      ), payload AS (
        SELECT
          nk.incident_key,
          COALESCE(nt.time_key, (SELECT time_key FROM dim_time_of_day ORDER BY time_key LIMIT 1)) AS time_key,
          TO_CHAR(b.ts, 'YYYYMMDD')::int AS date_key,
          COALESCE(ns.segment_key, (SELECT segment_key FROM dim_segment ORDER BY segment_key LIMIT 1)) AS segment_key,
          ns.location_key,
          ${incidentType}::varchar(50) AS incident_type,
          b.ts AS timestamp,
          2::smallint AS severity_level,
          0::int AS delay_seconds,
          b.geom AS geometry,
          FALSE AS is_simulated,
          TRUE AS is_active,
          NOW() AS inserted_at,
          1::smallint AS quality_flag,
          'USER_REPORT'::incident_source AS source,
          'PENDING'::incident_status AS status,
          ${input.reporterId}::varchar(255) AS reporter_id,
          ${input.imageUrl || null}::text AS image_url,
          0::int AS upvotes
        FROM base b
        CROSS JOIN next_key nk
        LEFT JOIN nearest_segment ns ON TRUE
        LEFT JOIN nearest_time nt ON TRUE
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
        quality_flag,
        source,
        status,
        reporter_id,
        image_url,
        upvotes
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
        quality_flag,
        source,
        status,
        reporter_id,
        image_url,
        upvotes
      FROM payload
      RETURNING incident_key, status
    `);

    const row = rows[0];
    void description; // Placeholder for future column support without changing API contract.

    return {
      reportId: row.incident_key.toString(),
      status: row.status,
    };
  }

  async updateOwnReport(input: {
    incidentId: string;
    reporterId: string;
    incidentType?: string;
    imageUrl?: string | null;
  }): Promise<void> {
    const incidentKey = BigInt(input.incidentId);
    const nextIncidentType = input.incidentType ? normalizeType(input.incidentType) : null;

    const updatedRows = await prisma.$queryRaw<Array<{ incident_key: bigint }>>(Prisma.sql`
      UPDATE fact_incident
      SET
        incident_type = COALESCE(${nextIncidentType}::varchar(50), incident_type),
        image_url = COALESCE(${input.imageUrl || null}::text, image_url),
        inserted_at = NOW()
      WHERE incident_key = ${incidentKey}
        AND reporter_id = ${input.reporterId}
        AND status = 'PENDING'::incident_status
      RETURNING incident_key
    `);

    if (updatedRows.length === 0) {
      throw new Error('Report not found or not editable');
    }
  }

  async moderateReport(incidentId: string, nextStatus: string): Promise<void> {
    const incidentKey = BigInt(incidentId);
    const normalizedStatus = normalizeStatus(nextStatus);

    const currentRows = await prisma.$queryRaw<Array<{ status: ReportStatus }>>(Prisma.sql`
      SELECT status
      FROM fact_incident
      WHERE incident_key = ${incidentKey}
      LIMIT 1
    `);

    if (currentRows.length === 0) {
      throw new Error('Report not found');
    }

    const currentStatus = currentRows[0].status;
    const allowed = ALLOWED_MODERATION_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(normalizedStatus)) {
      throw new Error(`Invalid status transition: ${currentStatus} -> ${normalizedStatus}`);
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE fact_incident
      SET
        status = ${normalizedStatus}::incident_status,
        is_active = ${normalizedStatus !== 'RESOLVED'},
        inserted_at = NOW()
      WHERE incident_key = ${incidentKey}
    `);
  }
}

export const userIncidentService = new UserIncidentService();
