// Incident Service (A2)
import { Prisma, PrismaClient } from '@prisma/client';
import {
  IncidentFeature,
  IncidentImpactQuery,
  IncidentImpactResponse,
  IncidentImpactSegment,
  IncidentQuery,
} from '../interfaces';
import { Logger } from '../utils/logger';

const prisma = new PrismaClient();
const logger = new Logger('IncidentService');

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
  private readonly impactCache = new Map<string, { expiresAt: number; data: IncidentImpactResponse }>();

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private toNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

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
          LOWER(${incidentType})::varchar(50) AS incident_type,
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

  async getImpactPropagation(incidentId: string, query: IncidentImpactQuery): Promise<IncidentImpactResponse> {
    const radiusMeters = this.clamp(this.toNumber(query.radiusMeters, 2000), 100, 5000);
    const ttiThreshold = this.clamp(this.toNumber(query.ttiThreshold, 1.5), 1.0, 5.0);
    const maxDepth = this.clamp(Math.floor(this.toNumber(query.maxDepth, 4)), 1, 10);
    const maxSegments = this.clamp(Math.floor(this.toNumber(query.maxSegments, 200)), 1, 500);
    const targetSpeedKmh =
      query.targetSpeedKmh !== undefined ? this.clamp(this.toNumber(query.targetSpeedKmh, 40), 5, 120) : null;

    const cacheKey = [incidentId, radiusMeters, ttiThreshold, maxDepth, maxSegments, targetSpeedKmh ?? 'auto'].join(
      '|'
    );
    const nowMs = Date.now();
    const cached = this.impactCache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs) {
      return cached.data;
    }

    const startedAt = Date.now();
    const incidentRows = await prisma.$queryRaw<
      Array<{
        incident_key: bigint;
        lng: number;
        lat: number;
        incident_type: string | null;
        severity_level: number | null;
        timestamp: Date;
      }>
    >(Prisma.sql`
      SELECT
        incident_key,
        ST_X(geometry) AS lng,
        ST_Y(geometry) AS lat,
        incident_type,
        severity_level,
        timestamp
      FROM fact_incident
      WHERE incident_key = ${BigInt(incidentId)}
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    if (incidentRows.length === 0) {
      throw new Error('INCIDENT_NOT_FOUND');
    }

    const incident = incidentRows[0];

    const topoRows = await prisma.$queryRaw<
      Array<{
        segmentId: bigint;
        geometry: GeoJSON.LineString;
        currentSpeed: number;
        targetSpeed: number;
        tti: number;
        distanceFromIncidentM: number;
        severityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        lengthM: number | null;
      }>
    >(Prisma.sql`
      WITH RECURSIVE incident_point AS (
        SELECT ST_SetSRID(ST_MakePoint(${incident.lng}, ${incident.lat}), 4326) AS geom
      ),
      seed_segment AS (
        SELECT s.segment_key, s.from_node_key, s.to_node_key
        FROM dim_segment s
        CROSS JOIN incident_point ip
        WHERE s.geometry_linestring IS NOT NULL
          AND ST_DWithin(s.geometry_linestring::geography, ip.geom::geography, ${radiusMeters})
        ORDER BY ST_Distance(s.geometry_linestring::geography, ip.geom::geography)
        LIMIT 1
      ),
      graph AS (
        SELECT
          ss.segment_key,
          ss.from_node_key,
          ss.to_node_key,
          1 AS depth,
          ARRAY[ss.segment_key] AS path
        FROM seed_segment ss

        UNION ALL

        SELECT
          n.segment_key,
          n.from_node_key,
          n.to_node_key,
          g.depth + 1,
          g.path || n.segment_key
        FROM graph g
        JOIN dim_segment n ON (
          n.segment_key <> g.segment_key
          AND (
            n.from_node_key = g.from_node_key
            OR n.from_node_key = g.to_node_key
            OR n.to_node_key = g.from_node_key
            OR n.to_node_key = g.to_node_key
          )
          AND NOT (n.segment_key = ANY(g.path))
        )
        WHERE g.depth < ${maxDepth}
      ),
      topo_segments AS (
        SELECT segment_key, MIN(depth) AS depth
        FROM graph
        GROUP BY segment_key
      ),
      latest_flow AS (
        SELECT DISTINCT ON (ftf.segment_key)
          ftf.segment_key,
          ftf.current_speed_kmh
        FROM fact_traffic_flow ftf
        ORDER BY ftf.segment_key, ftf.timestamp DESC
      ),
      candidates AS (
        SELECT
          s.segment_key AS "segmentId",
          ST_AsGeoJSON(s.geometry_linestring)::json AS geometry,
          COALESCE(lf.current_speed_kmh::float, 0) AS "currentSpeed",
          COALESCE(${targetSpeedKmh}::float, w.default_speed_limit::float, 40) AS "targetSpeed",
          CASE
            WHEN COALESCE(lf.current_speed_kmh::float, 0) <= 0 THEN 99
            ELSE COALESCE(${targetSpeedKmh}::float, w.default_speed_limit::float, 40) / lf.current_speed_kmh::float
          END AS tti,
          ST_Distance(s.geometry_linestring::geography, ip.geom::geography) AS "distanceFromIncidentM",
          s.length_m::float AS "lengthM"
        FROM topo_segments ts
        JOIN dim_segment s ON s.segment_key = ts.segment_key
        LEFT JOIN dim_way w ON w.way_key = s.way_key
        LEFT JOIN latest_flow lf ON lf.segment_key = s.segment_key
        CROSS JOIN incident_point ip
        WHERE s.geometry_linestring IS NOT NULL
          AND ST_DWithin(s.geometry_linestring::geography, ip.geom::geography, ${radiusMeters})
      )
      SELECT
        c."segmentId",
        c.geometry,
        c."currentSpeed",
        c."targetSpeed",
        c.tti,
        c."distanceFromIncidentM",
        CASE
          WHEN c.tti >= 2.5 THEN 'CRITICAL'
          WHEN c.tti >= 2.0 THEN 'HIGH'
          WHEN c.tti > ${ttiThreshold} THEN 'MEDIUM'
          ELSE 'LOW'
        END AS "severityLevel",
        c."lengthM"
      FROM candidates c
      WHERE c."currentSpeed" < c."targetSpeed"
         OR c.tti > ${ttiThreshold}
      ORDER BY c."distanceFromIncidentM" ASC
      LIMIT ${maxSegments}
    `);

    let degradedMode = false;
    let impactedRows = topoRows;

    if (topoRows.length === 0) {
      const spatialRows = await prisma.$queryRaw<
        Array<{
          segmentId: bigint;
          geometry: GeoJSON.LineString;
          currentSpeed: number;
          targetSpeed: number;
          tti: number;
          distanceFromIncidentM: number;
          severityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
          lengthM: number | null;
        }>
      >(Prisma.sql`
        WITH incident_point AS (
          SELECT ST_SetSRID(ST_MakePoint(${incident.lng}, ${incident.lat}), 4326) AS geom
        ),
        latest_flow AS (
          SELECT DISTINCT ON (ftf.segment_key)
            ftf.segment_key,
            ftf.current_speed_kmh
          FROM fact_traffic_flow ftf
          ORDER BY ftf.segment_key, ftf.timestamp DESC
        ),
        candidates AS (
          SELECT
            s.segment_key AS "segmentId",
            ST_AsGeoJSON(s.geometry_linestring)::json AS geometry,
            COALESCE(lf.current_speed_kmh::float, 0) AS "currentSpeed",
            COALESCE(${targetSpeedKmh}::float, w.default_speed_limit::float, 40) AS "targetSpeed",
            CASE
              WHEN COALESCE(lf.current_speed_kmh::float, 0) <= 0 THEN 99
              ELSE COALESCE(${targetSpeedKmh}::float, w.default_speed_limit::float, 40) / lf.current_speed_kmh::float
            END AS tti,
            ST_Distance(s.geometry_linestring::geography, ip.geom::geography) AS "distanceFromIncidentM",
            s.length_m::float AS "lengthM"
          FROM dim_segment s
          LEFT JOIN dim_way w ON w.way_key = s.way_key
          LEFT JOIN latest_flow lf ON lf.segment_key = s.segment_key
          CROSS JOIN incident_point ip
          WHERE s.geometry_linestring IS NOT NULL
            AND ST_DWithin(s.geometry_linestring::geography, ip.geom::geography, ${radiusMeters})
        )
        SELECT
          c."segmentId",
          c.geometry,
          c."currentSpeed",
          c."targetSpeed",
          c.tti,
          c."distanceFromIncidentM",
          CASE
            WHEN c.tti >= 2.5 THEN 'CRITICAL'
            WHEN c.tti >= 2.0 THEN 'HIGH'
            WHEN c.tti > ${ttiThreshold} THEN 'MEDIUM'
            ELSE 'LOW'
          END AS "severityLevel",
          c."lengthM"
        FROM candidates c
        WHERE c."currentSpeed" < c."targetSpeed"
           OR c.tti > ${ttiThreshold}
        ORDER BY c."distanceFromIncidentM" ASC
        LIMIT ${maxSegments}
      `);

      if (spatialRows.length > 0) {
        degradedMode = true;
        impactedRows = spatialRows;
      }
    }

    const impactedSegments: IncidentImpactSegment[] = impactedRows.map((row) => ({
      segmentId: row.segmentId.toString(),
      geometry: row.geometry,
      currentSpeed: Number(row.currentSpeed ?? 0),
      targetSpeed: Number(row.targetSpeed ?? 0),
      tti: Number(row.tti ?? 0),
      distanceFromIncidentM: Number(row.distanceFromIncidentM ?? 0),
      severityLevel: row.severityLevel,
    }));

    const impactedLengthKm = impactedRows.reduce((acc, row) => acc + Number(row.lengthM ?? 0), 0) / 1000;
    const maxQueueDistanceKm =
      impactedRows.length > 0
        ? Math.max(...impactedRows.map((row) => Number(row.distanceFromIncidentM ?? 0))) / 1000
        : 0;
    const maxTti = impactedRows.length > 0 ? Math.max(...impactedRows.map((row) => Number(row.tti ?? 0))) : 0;

    const severityScore = Math.min(
      100,
      Math.round(impactedSegments.length * 1.5 + Math.max(0, maxTti - 1) * 25 + impactedLengthKm * 5)
    );

    const response: IncidentImpactResponse = {
      incident: {
        incidentId: incident.incident_key.toString(),
        type: toIncidentType(incident.incident_type),
        severity: severityToLabel(incident.severity_level),
        timestamp: incident.timestamp.toISOString(),
        coordinates: [incident.lng, incident.lat],
      },
      impactedSegments,
      summary: {
        totalImpactedSegments: impactedSegments.length,
        impactedLengthKm,
        maxQueueDistanceKm,
        severityScore,
      },
      degradedMode,
    };

    this.impactCache.set(cacheKey, {
      expiresAt: nowMs + 45000,
      data: response,
    });

    logger.log('incident_impact_requests_total', { incidentId, degradedMode });
    logger.log('incident_impact_segments_count', { count: impactedSegments.length });
    logger.log('incident_impact_query_latency_ms', { latencyMs: Date.now() - startedAt });

    return response;
  }
}

export const incidentService = new IncidentService();
