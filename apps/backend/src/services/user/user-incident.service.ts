import { Prisma } from '../../config/prisma';
import { prisma } from '../../config/prisma';

type ReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type IncidentType = 'ACCIDENT' | 'FLOOD' | 'CONGESTION';

const ALLOWED_INCIDENT_TYPES: IncidentType[] = ['ACCIDENT', 'FLOOD', 'CONGESTION'];
const ALLOWED_MODERATION_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
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
  const incoming = (status || '').toUpperCase();
  const normalized = (incoming === 'VERIFIED' ? 'APPROVED' : incoming) as ReportStatus;
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(normalized)) {
    throw new Error('Invalid status. Allowed values: PENDING, APPROVED, REJECTED');
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

export interface CitizenReportItem {
  reportId: string;
  incidentType: string;
  status: ReportStatus;
  description: string | null;
  imageUrl: string | null;
  moderationNote: string | null;
  roadName: string;
  occurredAt: string;
  updatedAt: string;
  location: {
    lat: number;
    long: number;
  };
  distanceKm?: number;
  reporterId?: string;
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
        fcr.image_url,
        ST_X(fi.geometry) AS lng,
        ST_Y(fi.geometry) AS lat,
        ROUND((ST_DistanceSphere(fi.geometry, up.geom) / 1000.0)::numeric, 3)::float8 AS distance_km,
        COALESCE(dr.name, CONCAT('Segment ', fi.segment_key::text)) AS road_name
      FROM fact_incident fi
      CROSS JOIN user_point up
      LEFT JOIN fact_citizen_report fcr
        ON fcr.approved_incident_key = fi.incident_key
       AND fcr.status = 'APPROVED'::citizen_report_status
      LEFT JOIN dim_segment ds ON ds.segment_key = fi.segment_key
      LEFT JOIN dim_way dw ON dw.way_key = ds.way_key
      LEFT JOIN dim_road dr ON dr.road_key = dw.road_key
      WHERE fi.geometry IS NOT NULL
        AND fi.is_active = TRUE
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

    const rows = await prisma.$queryRaw<Array<{ report_key: bigint; status: ReportStatus }>>(Prisma.sql`
      WITH base AS (
        SELECT
          ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326) AS geom,
          NOW() AS ts
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
          COALESCE(nt.time_key, (SELECT time_key FROM dim_time_of_day ORDER BY time_key LIMIT 1)) AS time_key,
          TO_CHAR(b.ts, 'YYYYMMDD')::int AS date_key,
          COALESCE(ns.segment_key, (SELECT segment_key FROM dim_segment ORDER BY segment_key LIMIT 1)) AS segment_key,
          ns.location_key,
          ${incidentType}::varchar(50) AS incident_type,
          ${description}::text AS description,
          ${input.imageUrl || null}::text AS image_url,
          b.ts AS timestamp,
          b.geom AS geometry,
          ${input.reporterId}::varchar(255) AS reporter_id,
          'PENDING'::citizen_report_status AS status,
          NOW() AS created_at,
          NOW() AS updated_at
        FROM base b
        LEFT JOIN nearest_segment ns ON TRUE
        LEFT JOIN nearest_time nt ON TRUE
      )
      INSERT INTO fact_citizen_report (
        time_key,
        date_key,
        segment_key,
        location_key,
        incident_type,
        description,
        image_url,
        timestamp,
        geometry,
        reporter_id,
        status,
        created_at,
        updated_at
      )
      SELECT
        time_key,
        date_key,
        segment_key,
        location_key,
        incident_type,
        description,
        image_url,
        timestamp,
        geometry,
        reporter_id,
        status,
        created_at,
        updated_at
      FROM payload
      RETURNING report_key, status
    `);

    const row = rows[0];
    return {
      reportId: row.report_key.toString(),
      status: row.status,
    };
  }


  async getOwnReports(reporterId: string, status?: string): Promise<CitizenReportItem[]> {
    if (!reporterId) {
      throw new Error('Reporter ID is required');
    }

    const whereStatus = status ? normalizeStatus(status) : null;

    const rows = await prisma.$queryRaw<
      Array<{
        report_key: bigint;
        incident_type: string | null;
        status: ReportStatus;
        description: string | null;
        image_url: string | null;
        moderation_note: string | null;
        timestamp: Date;
        updated_at: Date;
        lng: number;
        lat: number;
        road_name: string | null;
      }>
    >(Prisma.sql`
      SELECT
        r.report_key,
        r.incident_type,
        r.status,
        r.description,
        r.image_url,
        r.moderation_note,
        r.timestamp,
        r.updated_at,
        ST_X(r.geometry) AS lng,
        ST_Y(r.geometry) AS lat,
        COALESCE(dr.name, CONCAT('Segment ', r.segment_key::text)) AS road_name
      FROM fact_citizen_report r
      LEFT JOIN dim_segment ds ON ds.segment_key = r.segment_key
      LEFT JOIN dim_way dw ON dw.way_key = ds.way_key
      LEFT JOIN dim_road dr ON dr.road_key = dw.road_key
      WHERE r.reporter_id = ${reporterId}
        AND (${whereStatus}::citizen_report_status IS NULL OR r.status = ${whereStatus}::citizen_report_status)
      ORDER BY r.created_at DESC
      LIMIT 200
    `);

    return rows.map((row) => ({
      reportId: row.report_key.toString(),
      incidentType: row.incident_type || 'OTHER',
      status: row.status,
      description: row.description,
      imageUrl: row.image_url,
      moderationNote: row.moderation_note,
      roadName: row.road_name || 'Unknown road',
      occurredAt: row.timestamp.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      location: {
        lat: row.lat,
        long: row.lng,
      },
    }));
  }

  async getReportsForAdmin(status?: string): Promise<CitizenReportItem[]> {
    const whereStatus = status ? normalizeStatus(status) : null;

    const rows = await prisma.$queryRaw<
      Array<{
        report_key: bigint;
        incident_type: string | null;
        status: ReportStatus;
        description: string | null;
        image_url: string | null;
        moderation_note: string | null;
        timestamp: Date;
        updated_at: Date;
        reporter_id: string;
        lng: number;
        lat: number;
        road_name: string | null;
      }>
    >(Prisma.sql`
      SELECT
        r.report_key,
        r.incident_type,
        r.status,
        r.description,
        r.image_url,
        r.moderation_note,
        r.timestamp,
        r.updated_at,
        r.reporter_id,
        ST_X(r.geometry) AS lng,
        ST_Y(r.geometry) AS lat,
        COALESCE(dr.name, CONCAT('Segment ', r.segment_key::text)) AS road_name
      FROM fact_citizen_report r
      LEFT JOIN dim_segment ds ON ds.segment_key = r.segment_key
      LEFT JOIN dim_way dw ON dw.way_key = ds.way_key
      LEFT JOIN dim_road dr ON dr.road_key = dw.road_key
      WHERE (${whereStatus}::citizen_report_status IS NULL OR r.status = ${whereStatus}::citizen_report_status)
      ORDER BY r.created_at DESC
      LIMIT 300
    `);

    return rows.map((row) => ({
      reportId: row.report_key.toString(),
      incidentType: row.incident_type || 'OTHER',
      status: row.status,
      description: row.description,
      imageUrl: row.image_url,
      moderationNote: row.moderation_note,
      roadName: row.road_name || 'Unknown road',
      occurredAt: row.timestamp.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      reporterId: row.reporter_id,
      location: {
        lat: row.lat,
        long: row.lng,
      },
    }));
  }

  async moderateReport(
    reportId: string,
    nextStatus: string,
    moderatorId?: string,
    moderationNote?: string
  ): Promise<void> {
    const reportKey = BigInt(reportId);
    const normalizedStatus = normalizeStatus(nextStatus);

    await prisma.$transaction(async (tx) => {
      const currentRows = await tx.$queryRaw<
        Array<{
          status: ReportStatus;
          approved_incident_key: bigint | null;
        }>
      >(Prisma.sql`
        SELECT
          status,
          approved_incident_key
        FROM fact_citizen_report
        WHERE report_key = ${reportKey}
        LIMIT 1
        FOR UPDATE
      `);

      if (currentRows.length === 0) {
        throw new Error('Report not found');
      }

      const current = currentRows[0];
      const allowed = ALLOWED_MODERATION_TRANSITIONS[current.status] || [];

      if (!allowed.includes(normalizedStatus)) {
        throw new Error(`Invalid status transition: ${current.status} -> ${normalizedStatus}`);
      }

      let approvedIncidentKey: bigint | null = current.approved_incident_key;

      if (normalizedStatus === 'APPROVED' && !approvedIncidentKey) {
        const createdRows = await tx.$queryRaw<Array<{ incident_key: bigint }>>(Prisma.sql`
          WITH next_key AS (
            SELECT COALESCE(MAX(incident_key), 0) + 1 AS incident_key
            FROM fact_incident
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
            nk.incident_key,
            r.time_key,
            r.date_key,
            r.segment_key,
            r.location_key,
            LOWER(COALESCE(r.incident_type, 'other'))::varchar(50),
            r.timestamp,
            2::smallint,
            0::int,
            r.geometry,
            FALSE,
            TRUE,
            NOW(),
            1::smallint
          FROM next_key nk
          JOIN fact_citizen_report r ON r.report_key = ${reportKey}
          RETURNING incident_key
        `);

        approvedIncidentKey = createdRows[0]?.incident_key ?? null;
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE fact_citizen_report
        SET
          status = ${normalizedStatus}::citizen_report_status,
          moderation_note = COALESCE(${moderationNote || null}::text, moderation_note),
          moderated_by = COALESCE(${moderatorId || null}::varchar(255), moderated_by),
          approved_incident_key = COALESCE(${approvedIncidentKey}, approved_incident_key),
          approved_at = CASE WHEN ${normalizedStatus} = 'APPROVED' THEN NOW() ELSE approved_at END,
          rejected_at = CASE WHEN ${normalizedStatus} = 'REJECTED' THEN NOW() ELSE rejected_at END,
          updated_at = NOW()
        WHERE report_key = ${reportKey}
      `);
    });
  }
}

export const userIncidentService = new UserIncidentService();
