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

const logger = new Logger('HistoryService');

const BASE_JOIN = `
  FROM fact_traffic_flow f
  JOIN mv_dim_segment_with_road_key s ON s.segment_key = f.segment_key
  LEFT JOIN dim_road r ON r.road_key = s.road_key
`;

const buildFilters = (params: HistoryExportParams) => {
  const conditions: string[] = ['f.inserted_at >= $1::timestamp', 'f.inserted_at <= $2::timestamp'];
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
          f.inserted_at AS "timestamp",
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
        f.inserted_at AS "timestamp",
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
      ORDER BY f.inserted_at DESC
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
}

export const historyService = new HistoryService();
