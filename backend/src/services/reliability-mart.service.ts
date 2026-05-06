import { prisma } from '../config/prisma';
import { AppError } from '../middlewares/error.middleware';
import { Logger } from '../utils/logger';

const logger = new Logger('ReliabilityMartService');

export type ReliabilityTimeWindow = 'AM_PEAK' | 'PM_PEAK' | 'OFF_PEAK';
export type ReliabilitySortBy = 'buffer_index' | 'pti';
export type ReliabilitySourcePeriod = 'WEEKLY' | 'MONTHLY';

export interface ReliabilityBatchPayload {
  periodStart: string;
  periodEnd: string;
  sourcePeriod: ReliabilitySourcePeriod;
  forceRecompute?: boolean;
  jobRunId?: string;
}

export interface ReliabilityQuery {
  timeWindow: ReliabilityTimeWindow;
  sortBy: ReliabilitySortBy;
  limit: number;
  corridorKey?: string;
}

interface ReliabilityApiRow {
  corridorKey: bigint;
  corridorName: string;
  segmentKey: bigint;
  segmentName: unknown;
  geometry: unknown;
  timeWindow: string;
  periodStart: Date;
  periodEnd: Date;
  tAvg: unknown;
  t95: unknown;
  tFreeflow: unknown;
  bufferIndex: unknown;
  pti: unknown;
  causeAccidentCount: number;
  causeFloodCount: number;
  causeConstructionCount: number;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseIsoDate(value: string, fieldName: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `${fieldName} must be a valid ISO date`, 'BAD_REQUEST');
  }
  return date;
}

export class ReliabilityMartService {
  async isMartEmpty(): Promise<boolean> {
    const result = await prisma.$queryRaw<Array<{ has_rows: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM report_reliability LIMIT 1) AS has_rows
    `;
    return !(result[0]?.has_rows ?? false);
  }

  async computeReliabilityPeriod(payload: ReliabilityBatchPayload): Promise<{ upsertedRows: number }> {
    const periodStartDate = parseIsoDate(payload.periodStart, 'periodStart');
    const periodEndDate = parseIsoDate(payload.periodEnd, 'periodEnd');

    if (periodEndDate <= periodStartDate) {
      throw new AppError(400, 'periodEnd must be greater than periodStart', 'BAD_REQUEST');
    }

    const spatialFallbackEnabled = process.env.RELIABILITY_SPATIAL_FALLBACK === 'true';
    const spatialSegmentExpr = spatialFallbackEnabled
      ? `
      COALESCE(
        i.segment_key,
        (
          SELECT s.segment_key
          FROM dim_segment s
          WHERE i.geometry IS NOT NULL
            AND s.geometry_center IS NOT NULL
            AND ST_DWithin(i.geometry, s.geometry_center, 50)
          ORDER BY ST_Distance(i.geometry, s.geometry_center) ASC
          LIMIT 1
        )
      )
    `
      : 'i.segment_key';

    logger.log(
      `Computing reliability mart period: ${periodStartDate.toISOString()} -> ${periodEndDate.toISOString()}, sourcePeriod=${payload.sourcePeriod}, spatialFallback=${spatialFallbackEnabled}`
    );

    const sql = `
      WITH flow_source AS (
        SELECT
          bcs.corridor_key,
          f.segment_key,
          f.inserted_at,
          CASE
            WHEN EXTRACT(HOUR FROM f.inserted_at) BETWEEN 7 AND 9 THEN 'AM_PEAK'
            WHEN EXTRACT(HOUR FROM f.inserted_at) BETWEEN 16 AND 19 THEN 'PM_PEAK'
            WHEN EXTRACT(HOUR FROM f.inserted_at) BETWEEN 10 AND 15 OR EXTRACT(HOUR FROM f.inserted_at) BETWEEN 20 AND 23 THEN 'OFF_PEAK'
            ELSE NULL
          END AS time_window,
          CASE
            WHEN f.current_speed_kmh IS NOT NULL AND f.current_speed_kmh > 0 AND s.length_m IS NOT NULL
              THEN (s.length_m::numeric * 3.6) / f.current_speed_kmh
            WHEN f.delay_seconds IS NOT NULL
              THEN f.delay_seconds::numeric
            ELSE NULL
          END AS travel_time_seconds
        FROM fact_traffic_flow f
        INNER JOIN dim_segment s ON s.segment_key = f.segment_key
        INNER JOIN bridge_corridor_segment bcs ON bcs.segment_key = f.segment_key
        WHERE f.inserted_at >= $1::timestamp
          AND f.inserted_at < $2::timestamp
          AND f.is_closed IS DISTINCT FROM true
      ),
      metric_source AS (
        SELECT
          corridor_key,
          segment_key,
          time_window,
          travel_time_seconds
        FROM flow_source
        WHERE time_window IS NOT NULL
          AND travel_time_seconds IS NOT NULL
          AND travel_time_seconds > 0
      ),
      metric_agg AS (
        SELECT
          corridor_key,
          segment_key,
          time_window,
          AVG(travel_time_seconds)::numeric AS t_avg,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY travel_time_seconds)::numeric AS t_95,
          COUNT(*)::int AS sample_count
        FROM metric_source
        GROUP BY corridor_key, segment_key, time_window
      ),
      freeflow_source AS (
        SELECT
          bcs.corridor_key,
          f.segment_key,
          CASE
            WHEN f.current_speed_kmh IS NOT NULL AND f.current_speed_kmh > 0 AND s.length_m IS NOT NULL
              THEN (s.length_m::numeric * 3.6) / f.current_speed_kmh
            WHEN f.delay_seconds IS NOT NULL
              THEN f.delay_seconds::numeric
            ELSE NULL
          END AS travel_time_seconds
        FROM fact_traffic_flow f
        INNER JOIN dim_segment s ON s.segment_key = f.segment_key
        INNER JOIN bridge_corridor_segment bcs ON bcs.segment_key = f.segment_key
        WHERE f.inserted_at >= $1::timestamp
          AND f.inserted_at < $2::timestamp
          AND EXTRACT(HOUR FROM f.inserted_at) BETWEEN 0 AND 4
          AND f.is_closed IS DISTINCT FROM true
      ),
      freeflow_agg AS (
        SELECT
          corridor_key,
          segment_key,
          AVG(travel_time_seconds)::numeric AS t_freeflow
        FROM freeflow_source
        WHERE travel_time_seconds IS NOT NULL
          AND travel_time_seconds > 0
        GROUP BY corridor_key, segment_key
      ),
      freeflow_fallback_agg AS (
        SELECT
          corridor_key,
          segment_key,
          percentile_cont(0.15) WITHIN GROUP (ORDER BY travel_time_seconds)::numeric AS t_freeflow
        FROM flow_source
        WHERE travel_time_seconds IS NOT NULL
          AND travel_time_seconds > 0
        GROUP BY corridor_key, segment_key
      ),
      incident_source AS (
        SELECT
          bcs.corridor_key,
          ${spatialSegmentExpr} AS segment_key,
          CASE
            WHEN EXTRACT(HOUR FROM i.timestamp) BETWEEN 7 AND 9 THEN 'AM_PEAK'
            WHEN EXTRACT(HOUR FROM i.timestamp) BETWEEN 16 AND 19 THEN 'PM_PEAK'
            WHEN EXTRACT(HOUR FROM i.timestamp) BETWEEN 10 AND 15 OR EXTRACT(HOUR FROM i.timestamp) BETWEEN 20 AND 23 THEN 'OFF_PEAK'
            ELSE NULL
          END AS time_window,
          UPPER(COALESCE(i.incident_type, '')) AS incident_type
        FROM fact_incident i
        LEFT JOIN bridge_corridor_segment bcs ON bcs.segment_key = ${spatialSegmentExpr}
        WHERE i.timestamp >= $1::timestamp
          AND i.timestamp < $2::timestamp
          AND COALESCE(i.is_active, true) = true
      ),
      root_cause_agg AS (
        SELECT
          corridor_key,
          segment_key,
          time_window,
          SUM(CASE WHEN incident_type = 'ACCIDENT' THEN 1 ELSE 0 END)::int AS cause_accident_count,
          SUM(CASE WHEN incident_type = 'FLOOD' THEN 1 ELSE 0 END)::int AS cause_flood_count,
          SUM(CASE WHEN incident_type IN ('CONSTRUCTION', 'ROADWORK', 'ROAD_WORK', 'ROADWORKS') THEN 1 ELSE 0 END)::int AS cause_construction_count
        FROM incident_source
        WHERE corridor_key IS NOT NULL
          AND segment_key IS NOT NULL
          AND time_window IS NOT NULL
        GROUP BY corridor_key, segment_key, time_window
      ),
      upserted AS (
        INSERT INTO report_reliability (
          corridor_key,
          segment_key,
          time_window,
          period_start,
          period_end,
          t_avg,
          t_95,
          t_freeflow,
          buffer_index,
          pti,
          cause_accident_count,
          cause_flood_count,
          cause_construction_count,
          source_period,
          job_run_id,
          computed_at,
          quality_flag
        )
        SELECT
          m.corridor_key,
          m.segment_key,
          m.time_window,
          $1::timestamp,
          $2::timestamp,
          m.t_avg,
          m.t_95,
          COALESCE(ff.t_freeflow, ffb.t_freeflow) AS t_freeflow,
          CASE WHEN m.t_avg > 0 THEN (m.t_95 - m.t_avg) / m.t_avg ELSE NULL END AS buffer_index,
          CASE
            WHEN COALESCE(ff.t_freeflow, ffb.t_freeflow) > 0
              THEN m.t_95 / COALESCE(ff.t_freeflow, ffb.t_freeflow)
            ELSE NULL
          END AS pti,
          COALESCE(rc.cause_accident_count, 0),
          COALESCE(rc.cause_flood_count, 0),
          COALESCE(rc.cause_construction_count, 0),
          $3::varchar,
          $4::varchar,
          NOW(),
          CASE
            WHEN m.sample_count < 3 OR m.t_avg IS NULL OR m.t_95 IS NULL THEN 0
            WHEN COALESCE(ff.t_freeflow, ffb.t_freeflow) IS NULL OR COALESCE(ff.t_freeflow, ffb.t_freeflow) <= 0 THEN 0
            ELSE 1
          END::smallint AS quality_flag
        FROM metric_agg m
        LEFT JOIN freeflow_agg ff ON ff.corridor_key = m.corridor_key AND ff.segment_key = m.segment_key
        LEFT JOIN freeflow_fallback_agg ffb ON ffb.corridor_key = m.corridor_key AND ffb.segment_key = m.segment_key
        LEFT JOIN root_cause_agg rc ON rc.corridor_key = m.corridor_key AND rc.segment_key = m.segment_key AND rc.time_window = m.time_window
        ON CONFLICT (corridor_key, segment_key, time_window, period_start, period_end)
        DO UPDATE SET
          t_avg = EXCLUDED.t_avg,
          t_95 = EXCLUDED.t_95,
          t_freeflow = EXCLUDED.t_freeflow,
          buffer_index = EXCLUDED.buffer_index,
          pti = EXCLUDED.pti,
          cause_accident_count = EXCLUDED.cause_accident_count,
          cause_flood_count = EXCLUDED.cause_flood_count,
          cause_construction_count = EXCLUDED.cause_construction_count,
          source_period = EXCLUDED.source_period,
          job_run_id = EXCLUDED.job_run_id,
          computed_at = EXCLUDED.computed_at,
          quality_flag = EXCLUDED.quality_flag
        RETURNING report_key
      )
      SELECT COUNT(*)::int AS upserted_rows
      FROM upserted
    `;

    const result = await prisma.$queryRawUnsafe<Array<{ upserted_rows: number }>>(
      sql,
      periodStartDate.toISOString(),
      periodEndDate.toISOString(),
      payload.sourcePeriod,
      payload.jobRunId ?? null
    );

    const upsertedRows = result[0]?.upserted_rows ?? 0;
    logger.log(`Reliability mart upsert completed, rows=${upsertedRows}`);

    return { upsertedRows };
  }

  async getReliabilityFromMart(query: ReliabilityQuery): Promise<
    Array<{
      corridorKey: string;
      corridorName: string;
      segmentKey: string;
      segmentName: string;
      geometry: GeoJSON.LineString | null;
      timeWindow: ReliabilityTimeWindow;
      periodStart: string;
      periodEnd: string;
      tAvg: number | null;
      t95: number | null;
      tFreeflow: number | null;
      bufferIndex: number | null;
      pti: number | null;
      rootCauses: {
        accident: number;
        flood: number;
        construction: number;
      };
    }>
  > {
    const sortColumn = query.sortBy === 'pti' ? 'rr.pti' : 'rr.buffer_index';

    const sql = `
      WITH latest_period AS (
        SELECT MAX(period_end) AS period_end
        FROM report_reliability
        WHERE time_window = $1
          AND ($2::bigint IS NULL OR corridor_key = $2::bigint)
      ),
      segment_geom AS (
        SELECT
          s.segment_key,
          ST_AsGeoJSON(s.geometry_linestring)::json AS geometry
        FROM dim_segment s
      )
      SELECT
        rr.corridor_key AS "corridorKey",
        c.corridor_name AS "corridorName",
        rr.segment_key AS "segmentKey",
        COALESCE(s.segment_id_source::text, rr.segment_key::text) AS "segmentName",
        sg.geometry AS "geometry",
        rr.time_window AS "timeWindow",
        rr.period_start AS "periodStart",
        rr.period_end AS "periodEnd",
        rr.t_avg::float8 AS "tAvg",
        rr.t_95::float8 AS "t95",
        rr.t_freeflow::float8 AS "tFreeflow",
        rr.buffer_index::float8 AS "bufferIndex",
        rr.pti::float8 AS "pti",
        rr.cause_accident_count AS "causeAccidentCount",
        rr.cause_flood_count AS "causeFloodCount",
        rr.cause_construction_count AS "causeConstructionCount"
      FROM report_reliability rr
      INNER JOIN dim_corridor c ON c.corridor_key = rr.corridor_key
      INNER JOIN dim_segment s ON s.segment_key = rr.segment_key
      LEFT JOIN segment_geom sg ON sg.segment_key = rr.segment_key
      WHERE rr.time_window = $1
        AND ($2::bigint IS NULL OR rr.corridor_key = $2::bigint)
        AND rr.period_end = (SELECT period_end FROM latest_period)
      ORDER BY ${sortColumn} DESC NULLS LAST, rr.corridor_key ASC, rr.segment_key ASC
      LIMIT $3
    `;

    const corridorKey = query.corridorKey ? BigInt(query.corridorKey) : null;
    const rows = await prisma.$queryRawUnsafe<ReliabilityApiRow[]>(sql, query.timeWindow, corridorKey, query.limit);

    return rows.map((row) => ({
      corridorKey: row.corridorKey.toString(),
      corridorName: row.corridorName,
      segmentKey: row.segmentKey.toString(),
      segmentName: String(row.segmentName ?? row.segmentKey),
      geometry:
        row.geometry && typeof row.geometry === 'object' && (row.geometry as { type?: string }).type === 'LineString'
          ? (row.geometry as GeoJSON.LineString)
          : null,
      timeWindow: row.timeWindow as ReliabilityTimeWindow,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      tAvg: toNullableNumber(row.tAvg),
      t95: toNullableNumber(row.t95),
      tFreeflow: toNullableNumber(row.tFreeflow),
      bufferIndex: toNullableNumber(row.bufferIndex),
      pti: toNullableNumber(row.pti),
      rootCauses: {
        accident: row.causeAccidentCount ?? 0,
        flood: row.causeFloodCount ?? 0,
        construction: row.causeConstructionCount ?? 0,
      },
    }));
  }
}

export const reliabilityMartService = new ReliabilityMartService();
