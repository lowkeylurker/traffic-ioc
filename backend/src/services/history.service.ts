import { format } from 'fast-csv';
import QueryStream from 'pg-query-stream';
import { Response } from 'express';
import pool, { query } from '../config/db';
import { Logger } from '../utils/logger';

export interface HistoryQueryParams {
  page: number;
  limit: number;
  startDateTime: string;
  endDateTime: string;
  roadKey?: string;
  roadName?: string;
  minTrafficIndex?: number;
}

export interface HistoryExportParams {
  startDateTime: string;
  endDateTime: string;
  roadKey?: string;
  roadName?: string;
  minTrafficIndex?: number;
}

export interface HistoryRecord {
  timestamp: string;
  roadName: string | null;
  district: string | null;
  segmentId: string;
  avgSpeedKmh: number | null;
  pcuVolume: number | null;
  delaySeconds: number | null;
  trafficIndex: number | null;
}

export interface HistoryPageResult {
  items: HistoryRecord[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface HistoryHotspotPoint {
  roadName: string;
  trafficIndex: number;
}

export interface HistoryTrendPoint {
  timestamp: string;
  value: number;
}

export interface HistorySummary {
  avgSpeedTrend: HistoryTrendPoint[];
  congestionTrend: HistoryTrendPoint[];
  totalPcu: number;
  flowEfficiency: number;
  totalDelay: number;
  losStability: number;
  avgSpeed: number;
  worstRoad: string;
}

const logger = new Logger('HistoryService');

const BASE_JOIN = `
  FROM fact_traffic_flow f
  JOIN mv_dim_segment_with_road_key s ON s.segment_key = f.segment_key
  LEFT JOIN dim_road r ON r.road_key = s.road_key
`;

const buildFilters = (params: HistoryExportParams) => {
  const conditions: string[] = ['f.timestamp >= $1::timestamp', 'f.timestamp <= $2::timestamp'];
  const values: Array<string | number> = [params.startDateTime, params.endDateTime];

  if (params.roadKey) {
    values.push(params.roadKey);
    conditions.push(`s.road_key = $${values.length}::bigint`);
  } else if (params.roadName) {
    values.push(params.roadName);
    conditions.push(`r.name = $${values.length}`);
  }

  if (params.minTrafficIndex !== undefined) {
    values.push(params.minTrafficIndex);
    conditions.push(`f.traffic_index >= $${values.length}`);
  }

  return {
    values,
    where: `WHERE ${conditions.join(' AND ')}`,
  };
};

export class HistoryService {
  async getHistory(params: HistoryQueryParams): Promise<HistoryPageResult> {
    const { values, where } = buildFilters(params);
    const offset = (params.page - 1) * params.limit;

    const dataResult = await query(
      `
      WITH filtered_history AS (
        SELECT
          f.timestamp AS "timestamp",
          r.name AS "roadName",
          l.district AS "district",
          s.segment_key::text AS "segmentId",
          f.current_speed_kmh AS "avgSpeedKmh",
          f.pcu_volume AS "pcuVolume",
          f.delay_seconds AS "delaySeconds",
          f.traffic_index AS "trafficIndex"
        ${BASE_JOIN}
        LEFT JOIN dim_location l ON l.location_key = s.location_key
        ${where}
      )
      SELECT
        filtered_history.*,
        COUNT(*) OVER()::int AS "totalItems"
      FROM filtered_history
      ORDER BY "timestamp" DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, params.limit, offset]
    );

    const totalItems = Number(dataResult.rows?.[0]?.totalItems ?? 0);
    const totalPages = params.limit > 0 ? Math.ceil(totalItems / params.limit) : 0;

    return {
      items: dataResult.rows.map(({ totalItems: _totalItems, ...row }) => row) as HistoryRecord[],
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages,
    };
  }

  async streamHistoryCsv(params: HistoryExportParams, res: Response): Promise<void> {
    const { values, where } = buildFilters(params);

    const sql = `
      SELECT
        f.timestamp AS "timestamp",
        r.name AS "roadName",
        l.district AS "district",
        s.segment_key::text AS "segmentId",
        f.current_speed_kmh AS "avgSpeedKmh",
        f.pcu_volume AS "pcuVolume",
        f.delay_seconds AS "delaySeconds",
        f.traffic_index AS "trafficIndex"
      ${BASE_JOIN}
      LEFT JOIN dim_location l ON l.location_key = s.location_key
      ${where}
      ORDER BY f.timestamp DESC
    `;

    const client = await pool.connect();
    const queryStream = new QueryStream(sql, values);
    const dbStream = client.query(queryStream);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="traffic_report.csv"');

    // Stream trực tiếp DB -> CSV -> HTTP để tránh tải toàn bộ dữ liệu vào RAM.
    const csvStream = format({
      headers: [
        'timestamp',
        'roadName',
        'district',
        'segmentId',
        'avgSpeedKmh',
        'pcuVolume',
        'delaySeconds',
        'trafficIndex',
      ],
    });

    let released = false;
    const releaseClient = () => {
      if (released) {
        return;
      }
      released = true;
      client.release();
    };

    dbStream.on('error', (error) => {
      logger.error('History CSV stream DB error', error);
      releaseClient();
      csvStream.end();
    });

    dbStream.on('end', () => {
      releaseClient();
    });

    csvStream.on('error', (error) => {
      logger.error('History CSV stream format error', error);
      releaseClient();
    });

    res.on('close', () => {
      releaseClient();
    });

    dbStream.pipe(csvStream).pipe(res);
  }

  async getTopHotspots(params: HistoryExportParams, limit = 8): Promise<HistoryHotspotPoint[]> {
    const { values, where } = buildFilters(params);

    const result = await query(
      `
      WITH filtered_history AS (
        SELECT
          COALESCE(r.name, CONCAT('Segment ', s.segment_key::text)) AS road_name,
          f.traffic_index AS traffic_index
        ${BASE_JOIN}
        ${where}
      )
      SELECT
        road_name AS "roadName",
        AVG(traffic_index)::float8 AS "trafficIndex"
      FROM filtered_history
      WHERE traffic_index IS NOT NULL
      GROUP BY road_name
      ORDER BY "trafficIndex" DESC, "roadName" ASC
      LIMIT $${values.length + 1}
      `,
      [...values, limit]
    );

    return result.rows.map((row) => ({
      roadName: row.roadName as string,
      trafficIndex: Number(row.trafficIndex ?? 0),
    }));
  }

  async getHistorySummary(params: HistoryExportParams): Promise<HistorySummary> {
    const { values, where } = buildFilters(params);

    // 1. Get trends aggregated by hour (or minute if range is small)
    // For simplicity, we'll use hour buckets for historical analytics
    const trendResult = await query(
      `
      SELECT
        DATE_TRUNC('hour', f.timestamp) AS bucket,
        AVG(f.current_speed_kmh)::float8 AS avg_speed,
        AVG(f.traffic_index)::float8 AS avg_index,
        SUM(f.pcu_volume)::bigint AS total_pcu,
        SUM(f.delay_seconds)::bigint AS total_delay,
        (COUNT(*) FILTER (WHERE f.los_level IN ('A', 'B', 'C'))::float8 / NULLIF(COUNT(*), 0))::float8 AS efficiency
      ${BASE_JOIN}
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
      values
    );

    // 2. Get overall metrics
    const overallResult = await query(
      `
      SELECT
        AVG(f.current_speed_kmh)::float8 AS avg_speed,
        SUM(f.pcu_volume)::bigint AS total_pcu,
        SUM(f.delay_seconds)::bigint AS total_delay,
        (COUNT(*) FILTER (WHERE f.los_level IN ('A', 'B', 'C'))::float8 / NULLIF(COUNT(*), 0))::float8 AS efficiency
      ${BASE_JOIN}
      ${where}
      `,
      values
    );

    // 3. Get worst road
    const worstRoadResult = await query(
      `
      SELECT
        COALESCE(r.name, CONCAT('Segment ', s.segment_key::text)) AS road_name
      ${BASE_JOIN}
      ${where}
      GROUP BY road_name
      ORDER BY AVG(f.traffic_index) ASC
      LIMIT 1
      `,
      values
    );

    const overall = overallResult.rows[0] || {};
    const worstRoad = worstRoadResult.rows[0]?.road_name ?? 'N/A';

    return {
      avgSpeedTrend: trendResult.rows.map(r => ({ timestamp: r.bucket, value: r.avg_speed })),
      congestionTrend: trendResult.rows.map(r => ({ timestamp: r.bucket, value: r.avg_index })),
      totalPcu: Number(overall.total_pcu ?? 0),
      flowEfficiency: Number(overall.efficiency ?? 0),
      totalDelay: Number(overall.total_delay ?? 0),
      losStability: 0.85, // Placeholder for complex calculation
      avgSpeed: Number(overall.avg_speed ?? 0),
      worstRoad
    };
  }
}

export const historyService = new HistoryService();
