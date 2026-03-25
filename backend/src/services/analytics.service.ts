// Analytics Service - Xử lý logic phân tích & thống kê

import { prisma } from '../config/prisma';
import {
  ComparisonMetric,
  ComparisonPoint,
  ComparisonQuery,
  CorridorDashboardData,
  CorridorDashboardQuery,
  CorridorOption,
  VehicleMixData,
} from '../interfaces/index';
import { AppError } from '../middlewares/error.middleware';
import { Logger } from '../utils/logger';

const logger = new Logger('AnalyticsService');

const metricConfig: Record<ComparisonMetric, { sqlExpr: string; unit: string; nonNegative: boolean }> = {
  currentSpeedKmh: {
    sqlExpr: 'f.current_speed_kmh',
    unit: 'km/h',
    nonNegative: true,
  },
  pcuVolume: {
    sqlExpr: 'f.pcu_volume',
    unit: 'pcu/h',
    nonNegative: true,
  },
  trafficIndex: {
    sqlExpr: 'f.traffic_index',
    unit: 'ratio',
    nonNegative: true,
  },
  losScore: {
    sqlExpr:
      "CASE UPPER(COALESCE(f.los_level, 'F')) WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 WHEN 'E' THEN 5 ELSE 6 END",
    unit: 'level',
    nonNegative: true,
  },
  congestionLevel: {
    sqlExpr: 'f.congestion_level',
    unit: 'level',
    nonNegative: true,
  },
  delaySeconds: {
    sqlExpr: 'f.delay_seconds',
    unit: 's',
    nonNegative: true,
  },
  occupancyRate: {
    sqlExpr:
      'CASE WHEN f.free_flow_speed_kmh > 0 THEN GREATEST(0, LEAST(100, (1 - (f.current_speed_kmh / f.free_flow_speed_kmh)) * 100)) END',
    unit: '%',
    nonNegative: true,
  },
  bufferIndex: {
    sqlExpr:
      'CASE WHEN f.free_flow_speed_kmh > 0 THEN GREATEST(0, ((f.free_flow_speed_kmh - f.current_speed_kmh) / f.free_flow_speed_kmh) * 100) END',
    unit: '%',
    nonNegative: true,
  },
};

interface ComparisonRow {
  hour: number;
  baselineAvg: number | null;
  baselineStdDev: number | null;
  todayValue: number | null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export class AnalyticsService {
  /**
   * Lấy dữ liệu tỷ lệ phương tiện (biểu đồ tròn)
   * Mock data - sẽ được cập nhật khi có bảng Dimension Vehicle
   */
  async getVehicleMix(): Promise<VehicleMixData[]> {
    try {
      logger.log('Fetching vehicle mix data');

      // TODO: Query từ bảng vehicle dimension khi có sẵn
      // Tạm thời trả mock data
      const mockData: VehicleMixData[] = [
        { category: 'Xe máy', count: 12500, percentage: 60 },
        { category: 'Ô tô', count: 7300, percentage: 35 },
        { category: 'Xe buýt', count: 1040, percentage: 5 },
      ];

      logger.log(`Retrieved ${mockData.length} vehicle categories`);
      return mockData;
    } catch (error) {
      logger.error('Error fetching vehicle mix data', error);
      throw error;
    }
  }

  /**
   * Lấy dữ liệu so sánh tốc độ (hiện tại vs baseline)
   */
  async getSpeedComparison(): Promise<any[]> {
    try {
      logger.log('Fetching speed comparison data');

      // Raw query để so sánh tốc độ hiện tại vs trung bình lịch sử
      const comparison = await prisma.$queryRaw`
        SELECT
          s.segment_id as "segmentId",
          s.segment_name as "segmentName",
          COALESCE(f.avg_speed, 0)::numeric as "currentSpeed",
          COALESCE(s.speed_limit_kmh, 50)::numeric as "baselineSpeed",
          ROUND(((COALESCE(f.avg_speed, 0) / COALESCE(s.speed_limit_kmh, 50)::numeric) * 100)::numeric, 2) as "speedRatio"
        FROM dim_segment s
        LEFT JOIN fact_traffic_flow f ON s.segment_id = f.segment_id
          AND f.flow_id = (
            SELECT flow_id FROM fact_traffic_flow
            WHERE segment_id = s.segment_id
            ORDER BY flow_id DESC LIMIT 1
          )
        ORDER BY "speedRatio" ASC
        LIMIT 20
      `;

      logger.log(`Retrieved speed comparison for ${Array.isArray(comparison) ? comparison.length : 0} segments`);
      return (comparison as any[]) || [];
    } catch (error) {
      logger.error('Error fetching speed comparison data', error);
      throw error;
    }
  }

  /**
   * A3 comparison API: merge baseline + today into 24 hourly points
   */
  async getComparison(query: ComparisonQuery): Promise<ComparisonPoint[]> {
    try {
      logger.log(
        `Fetching comparison data for scope=${query.scopeType}, segment=${query.segmentId ?? 'n/a'}, road=${query.roadKey ?? 'n/a'}, metric=${query.metric}, date=${query.date}`
      );

      const metric = metricConfig[query.metric];
      if (!metric) {
        throw new AppError(400, 'Unsupported metric', 'BAD_REQUEST');
      }

      let filterSql = '';
      let scopeValue: bigint;

      if (query.scopeType === 'road') {
        if (!query.roadKey) {
          throw new AppError(400, 'roadKey is required for road scope', 'BAD_REQUEST');
        }

        const road = await prisma.dim_road.findUnique({
          where: {
            road_key: BigInt(query.roadKey),
          },
          select: { road_key: true },
        });

        if (!road) {
          throw new AppError(404, 'Road not found', 'NOT_FOUND');
        }

        scopeValue = BigInt(query.roadKey);
        filterSql = `
          FROM fact_traffic_flow f
          INNER JOIN dim_segment s ON s.segment_key = f.segment_key
          INNER JOIN dim_way w ON w.way_key = s.way_key
          WHERE w.road_key = $1
        `;
      } else {
        if (!query.segmentId) {
          throw new AppError(400, 'segmentId is required for segment scope', 'BAD_REQUEST');
        }

        const segment = await prisma.dim_segment.findUnique({
          where: {
            segment_key: BigInt(query.segmentId),
          },
          select: { segment_key: true },
        });

        if (!segment) {
          throw new AppError(404, 'Segment not found', 'NOT_FOUND');
        }

        scopeValue = BigInt(query.segmentId);
        filterSql = `
          FROM fact_traffic_flow f
          WHERE f.segment_key = $1
        `;
      }

      const sql = `
        WITH hours AS (
          SELECT generate_series(0, 23) AS hour
        ),
        today AS (
          SELECT
            EXTRACT(HOUR FROM f.timestamp)::int AS hour,
            AVG((${metric.sqlExpr})::numeric) AS today_value
          ${filterSql}
            AND f.timestamp >= $2::date
            AND f.timestamp < CASE
              WHEN $2::date = CURRENT_DATE THEN NOW()
              ELSE ($2::date + INTERVAL '1 day')
            END
            AND (${metric.sqlExpr}) IS NOT NULL
          GROUP BY 1
        ),
        baseline_source AS (
          SELECT
            EXTRACT(HOUR FROM f.timestamp)::int AS hour,
            (${metric.sqlExpr})::numeric AS metric_value
          ${filterSql}
            AND f.timestamp >= ($2::date - INTERVAL '30 days')
            AND f.timestamp < $2::date
            AND EXTRACT(ISODOW FROM f.timestamp) = EXTRACT(ISODOW FROM $2::date)
            AND (${metric.sqlExpr}) IS NOT NULL
        ),
        baseline_weekday AS (
          SELECT
            hour,
            AVG(metric_value)::numeric AS baseline_avg,
            COALESCE(STDDEV_SAMP(metric_value), 0)::numeric AS baseline_std_dev,
            COUNT(*)::int AS sample_count
          FROM baseline_source
          GROUP BY hour
        ),
        baseline_30d_source AS (
          SELECT
            EXTRACT(HOUR FROM f.timestamp)::int AS hour,
            (${metric.sqlExpr})::numeric AS metric_value
          ${filterSql}
            AND f.timestamp >= ($2::date - INTERVAL '30 days')
            AND f.timestamp < $2::date
            AND (${metric.sqlExpr}) IS NOT NULL
        ),
        baseline_30d AS (
          SELECT
            hour,
            AVG(metric_value)::numeric AS baseline_avg,
            COALESCE(STDDEV_SAMP(metric_value), 0)::numeric AS baseline_std_dev,
            COUNT(*)::int AS sample_count
          FROM baseline_30d_source
          GROUP BY hour
        ),
        baseline_7d_source AS (
          SELECT
            EXTRACT(HOUR FROM f.timestamp)::int AS hour,
            (${metric.sqlExpr})::numeric AS metric_value
          ${filterSql}
            AND f.timestamp >= (NOW() - INTERVAL '7 days')
            AND f.timestamp < NOW()
            AND (${metric.sqlExpr}) IS NOT NULL
        ),
        baseline_7d AS (
          SELECT
            hour,
            AVG(metric_value)::numeric AS baseline_avg,
            COALESCE(STDDEV_SAMP(metric_value), 0)::numeric AS baseline_std_dev,
            COUNT(*)::int AS sample_count
          FROM baseline_7d_source
          GROUP BY hour
        ),
        baseline AS (
          SELECT
            h.hour,
            CASE
              WHEN bw.sample_count > 0 THEN bw.baseline_avg
              WHEN b30.sample_count > 0 THEN b30.baseline_avg
              WHEN b7.sample_count > 0 THEN b7.baseline_avg
              ELSE NULL
            END AS baseline_avg,
            CASE
              WHEN bw.sample_count > 0 THEN bw.baseline_std_dev
              WHEN b30.sample_count > 0 THEN b30.baseline_std_dev
              WHEN b7.sample_count > 0 THEN b7.baseline_std_dev
              ELSE NULL
            END AS baseline_std_dev
          FROM hours h
          LEFT JOIN baseline_weekday bw ON bw.hour = h.hour
          LEFT JOIN baseline_30d b30 ON b30.hour = h.hour
          LEFT JOIN baseline_7d b7 ON b7.hour = h.hour
        )
        SELECT
          h.hour,
          b.baseline_avg AS "baselineAvg",
          b.baseline_std_dev AS "baselineStdDev",
          t.today_value AS "todayValue"
        FROM hours h
        LEFT JOIN baseline b ON b.hour = h.hour
        LEFT JOIN today t ON t.hour = h.hour
        ORDER BY h.hour ASC
      `;

      const rows = await prisma.$queryRawUnsafe<ComparisonRow[]>(sql, scopeValue, query.date);

      const result: ComparisonPoint[] = rows.map((row) => {
        const baselineAvg = toNullableNumber(row.baselineAvg);
        const baselineStdDev = toNullableNumber(row.baselineStdDev);
        const todayValue = toNullableNumber(row.todayValue);

        let lowerBound: number | null = null;
        let upperBound: number | null = null;

        if (baselineAvg !== null && baselineStdDev !== null) {
          lowerBound = baselineAvg - baselineStdDev;
          upperBound = baselineAvg + baselineStdDev;
          if (metric.nonNegative) {
            lowerBound = Math.max(0, lowerBound);
          }
        }

        const isAnomaly =
          todayValue !== null &&
          lowerBound !== null &&
          upperBound !== null &&
          (todayValue < lowerBound || todayValue > upperBound);

        return {
          hour: row.hour,
          baselineAvg,
          baselineStdDev,
          lowerBound,
          upperBound,
          todayValue,
          isAnomaly,
          unit: metric.unit,
          metric: query.metric,
        };
      });

      logger.log(`Retrieved comparison rows: ${result.length}`);
      return result;
    } catch (error) {
      logger.error('Error fetching comparison data', error);
      throw error;
    }
  }

  async getCorridorOptions(): Promise<CorridorOption[]> {
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          corridorKey: bigint;
          corridorName: string;
          importanceLevel: number | null;
          targetAvgSpeed: number | null;
        }>
      >(`
        SELECT
          c.corridor_key AS "corridorKey",
          c.corridor_name AS "corridorName",
          c.importance_level AS "importanceLevel",
          c.target_avg_speed AS "targetAvgSpeed"
        FROM dim_corridor c
        ORDER BY c.importance_level DESC NULLS LAST, c.corridor_name ASC
      `);

      return rows.map((row) => ({
        corridorKey: row.corridorKey.toString(),
        corridorName: row.corridorName,
        importanceLevel: row.importanceLevel,
        targetAvgSpeed: toNullableNumber(row.targetAvgSpeed),
      }));
    } catch (error) {
      logger.error('Error fetching corridor options', error);
      throw error;
    }
  }

  async getCorridorDashboard(query: CorridorDashboardQuery): Promise<CorridorDashboardData> {
    try {
      const corridorKey = query.corridorKey ? BigInt(query.corridorKey) : null;

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          corridorKey: bigint;
          corridorName: string;
          targetAvgSpeed: number | null;
          bottleneckSegKey: bigint | null;
          hour: number;
          avgCorridorSpeed: number | null;
          totalDelaySeconds: number | null;
          travelTimeIndex: number | null;
          corridorEfficiency: number | null;
          activeIncidentCount: number | null;
        }>
      >(
        `
        SELECT
          c.corridor_key AS "corridorKey",
          c.corridor_name AS "corridorName",
          c.target_avg_speed AS "targetAvgSpeed",
          f.bottleneck_seg_key AS "bottleneckSegKey",
          EXTRACT(HOUR FROM f.timestamp)::int AS hour,
          AVG(f.avg_corridor_speed)::numeric AS "avgCorridorSpeed",
          SUM(f.total_delay_seconds)::numeric AS "totalDelaySeconds",
          AVG(f.travel_time_index)::numeric AS "travelTimeIndex",
          AVG(f.corridor_efficiency)::numeric AS "corridorEfficiency",
          SUM(f.active_incident_count)::numeric AS "activeIncidentCount"
        FROM fact_corridor_performance f
        INNER JOIN dim_corridor c ON c.corridor_key = f.corridor_key
        WHERE f.timestamp >= $1::date
          AND f.timestamp < ($1::date + INTERVAL '1 day')
          AND ($2::bigint IS NULL OR f.corridor_key = $2)
        GROUP BY
          c.corridor_key,
          c.corridor_name,
          c.target_avg_speed,
          f.bottleneck_seg_key,
          EXTRACT(HOUR FROM f.timestamp)
        ORDER BY hour ASC
      `,
        query.date,
        corridorKey
      );

      const baselineRows = await prisma.$queryRawUnsafe<
        Array<{
          avgSpeedBaseline: number | null;
          delayBaseline: number | null;
        }>
      >(
        `
        SELECT
          AVG(f.avg_corridor_speed)::numeric AS "avgSpeedBaseline",
          AVG(f.total_delay_seconds)::numeric AS "delayBaseline"
        FROM fact_corridor_performance f
        WHERE f.timestamp >= ($1::date - INTERVAL '30 days')
          AND f.timestamp < $1::date
          AND EXTRACT(ISODOW FROM f.timestamp) = EXTRACT(ISODOW FROM $1::date)
          AND ($2::bigint IS NULL OR f.corridor_key = $2)
      `,
        query.date,
        corridorKey
      );

      const kpiSource = rows;
      const avg = (values: Array<number | null>) => {
        const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
        if (valid.length === 0) return null;
        return valid.reduce((acc, v) => acc + v, 0) / valid.length;
      };

      const sum = (values: Array<number | null>) => values.reduce<number>((acc, value) => acc + (value ?? 0), 0);

      const kpis = {
        avgCorridorSpeed: avg(kpiSource.map((row) => toNullableNumber(row.avgCorridorSpeed))),
        targetAvgSpeed: avg(kpiSource.map((row) => toNullableNumber(row.targetAvgSpeed))),
        totalDelaySeconds: sum(kpiSource.map((row) => toNullableNumber(row.totalDelaySeconds))),
        travelTimeIndex: avg(kpiSource.map((row) => toNullableNumber(row.travelTimeIndex))),
        corridorEfficiency: avg(kpiSource.map((row) => toNullableNumber(row.corridorEfficiency))),
        activeIncidentCount: sum(kpiSource.map((row) => toNullableNumber(row.activeIncidentCount))),
      };

      const hourlyMap = new Map<
        number,
        {
          speedValues: number[];
          targetValues: number[];
          ttiValues: number[];
        }
      >();

      rows.forEach((row) => {
        const bucket = hourlyMap.get(row.hour) ?? {
          speedValues: [],
          targetValues: [],
          ttiValues: [],
        };

        const speed = toNullableNumber(row.avgCorridorSpeed);
        const target = toNullableNumber(row.targetAvgSpeed);
        const tti = toNullableNumber(row.travelTimeIndex);

        if (speed !== null) bucket.speedValues.push(speed);
        if (target !== null) bucket.targetValues.push(target);
        if (tti !== null) bucket.ttiValues.push(tti);

        hourlyMap.set(row.hour, bucket);
      });

      const speedVsTarget = Array.from(hourlyMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([hour, value]) => ({
          hour,
          avgCorridorSpeed:
            value.speedValues.length > 0
              ? value.speedValues.reduce((acc, x) => acc + x, 0) / value.speedValues.length
              : null,
          targetAvgSpeed:
            value.targetValues.length > 0
              ? value.targetValues.reduce((acc, x) => acc + x, 0) / value.targetValues.length
              : null,
        }));

      const ttiHourly = Array.from(hourlyMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([hour, value]) => ({
          hour,
          travelTimeIndex:
            value.ttiValues.length > 0 ? value.ttiValues.reduce((acc, x) => acc + x, 0) / value.ttiValues.length : null,
        }));

      const delayByCorridor = new Map<string, { corridorName: string; totalDelaySeconds: number }>();
      rows.forEach((row) => {
        const key = row.corridorKey.toString();
        const current = delayByCorridor.get(key) ?? {
          corridorName: row.corridorName,
          totalDelaySeconds: 0,
        };
        current.totalDelaySeconds += toNullableNumber(row.totalDelaySeconds) ?? 0;
        delayByCorridor.set(key, current);
      });

      const topDelayCorridors = Array.from(delayByCorridor.entries())
        .map(([key, value]) => ({
          corridorKey: key,
          corridorName: value.corridorName,
          totalDelaySeconds: value.totalDelaySeconds,
        }))
        .sort((a, b) => b.totalDelaySeconds - a.totalDelaySeconds)
        .slice(0, 10);

      const heatmap = rows.map((row) => ({
        corridorKey: row.corridorKey.toString(),
        corridorName: row.corridorName,
        hour: row.hour,
        travelTimeIndex: toNullableNumber(row.travelTimeIndex),
      }));

      const bottleneckCounter = new Map<string, number>();
      rows.forEach((row) => {
        if (row.bottleneckSegKey === null) return;
        const key = row.bottleneckSegKey.toString();
        bottleneckCounter.set(key, (bottleneckCounter.get(key) ?? 0) + 1);
      });

      const topBottlenecks = Array.from(bottleneckCounter.entries())
        .map(([segmentKey, count]) => ({ segmentKey, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const baseline = baselineRows[0] ?? { avgSpeedBaseline: null, delayBaseline: null };
      const speedBaseline = toNullableNumber(baseline.avgSpeedBaseline);
      const delayBaseline = toNullableNumber(baseline.delayBaseline);

      const speedDeltaPct =
        speedBaseline && speedBaseline !== 0 && kpis.avgCorridorSpeed !== null
          ? ((kpis.avgCorridorSpeed - speedBaseline) / speedBaseline) * 100
          : null;

      const delayDeltaPct =
        delayBaseline && delayBaseline !== 0 && kpis.totalDelaySeconds !== null
          ? ((kpis.totalDelaySeconds - delayBaseline) / delayBaseline) * 100
          : null;

      return {
        kpis,
        speedVsTarget,
        ttiHourly,
        topDelayCorridors,
        heatmap,
        topBottlenecks,
        alerts: {
          isBelowTargetSpeed:
            kpis.avgCorridorSpeed !== null &&
            kpis.targetAvgSpeed !== null &&
            kpis.avgCorridorSpeed < kpis.targetAvgSpeed,
          isHighTti: kpis.travelTimeIndex !== null && kpis.travelTimeIndex > 1.5,
          isHighIncidentCount: kpis.activeIncidentCount !== null && kpis.activeIncidentCount >= 5,
        },
        baselineComparison: {
          speedDeltaPct,
          delayDeltaPct,
        },
      };
    } catch (error) {
      logger.error('Error fetching corridor dashboard data', error);
      throw error;
    }
  }

  /**
   * Lấy bảng xếp hạng Top 10 đoạn đường có tỷ lệ đáng tin cậy cao nhất (Buffer Index)
   * Buffer Index = (Baseline Speed - Current Speed) / Baseline Speed
   */
  async getReliabilityRanking(): Promise<any[]> {
    try {
      logger.log('Fetching reliability ranking');

      // Raw query để tính Buffer Index và xếp hạng
      const ranking = await prisma.$queryRaw`
        SELECT
          s.segment_id as "segmentId",
          s.segment_name as "segmentName",
          COALESCE(f.avg_speed, 0)::numeric as "currentSpeed",
          COALESCE(s.speed_limit_kmh, 50)::numeric as "baselineSpeed",
          ROUND((
            (COALESCE(s.speed_limit_kmh, 50)::numeric - COALESCE(f.avg_speed, 0)::numeric)
            / COALESCE(s.speed_limit_kmh, 50)::numeric * 100
          )::numeric, 2) as "bufferIndex"
        FROM dim_segment s
        LEFT JOIN fact_traffic_flow f ON s.segment_id = f.segment_id
          AND f.flow_id = (
            SELECT flow_id FROM fact_traffic_flow
            WHERE segment_id = s.segment_id
            ORDER BY flow_id DESC LIMIT 1
          )
        ORDER BY "bufferIndex" DESC
        LIMIT 10
      `;

      logger.log(`Retrieved reliability ranking for ${Array.isArray(ranking) ? ranking.length : 0} segments`);
      return (ranking as any[]) || [];
    } catch (error) {
      logger.error('Error fetching reliability ranking', error);
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();
