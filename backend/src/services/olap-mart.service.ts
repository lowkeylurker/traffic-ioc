import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';

const logger = new Logger('OlapMartService');

interface HeatmapRow {
  hour_of_day: number;
  road_name: string;
  avg_traffic_index: number;
}

interface CrossAnalysisRow {
  road_name: string;
  design_capacity: number;
  avg_traffic_index: number;
  avg_pcu_volume: number;
  avg_delay_seconds: number;
}

interface DrilldownRow {
  label: string;
  avg_delay_seconds: number;
}

const toFinite = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export interface OlapCrossAnalysisPoint {
  roadName: string;
  designCapacity: number;
  avgTrafficIndex: number;
  avgPcuVolume: number;
  avgDelaySeconds: number;
}

export interface OlapDrilldownPoint {
  label: string;
  avgDelaySeconds: number;
}

export class OlapMartService {
  async refreshMaterializedView(): Promise<void> {
    try {
      logger.log('Refreshing materialized view mv_olap_traffic_summary...');
      await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_olap_traffic_summary;');
      logger.log('Materialized view mv_olap_traffic_summary refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh mv_olap_traffic_summary', error);
      throw error;
    }
  }

  async getHeatmap(district?: string): Promise<Array<[number, string, number]>> {
    const rows = await prisma.$queryRawUnsafe<HeatmapRow[]>(
      `SELECT
        hour_of_day,
        road_name,
        AVG(avg_traffic_index)::float8 AS avg_traffic_index
      FROM mv_olap_traffic_summary
      ${district ? 'WHERE district = $1' : ''}
      GROUP BY hour_of_day, road_name
      ORDER BY road_name ASC, hour_of_day ASC`,
      ...(district ? [district] : [])
    );

    return rows.map((row) => [
      Math.max(0, Math.min(23, Math.round(toFinite(row.hour_of_day, 0)))),
      row.road_name,
      Number(toFinite(row.avg_traffic_index, 0).toFixed(3)),
    ]);
  }

  async getCrossAnalysis(district?: string): Promise<OlapCrossAnalysisPoint[]> {
    const rows = await prisma.$queryRawUnsafe<CrossAnalysisRow[]>(
      `SELECT
        road_name,
        AVG(design_capacity)::float8 AS design_capacity,
        AVG(avg_traffic_index)::float8 AS avg_traffic_index,
        AVG(avg_pcu_volume)::float8 AS avg_pcu_volume,
        AVG(avg_delay_seconds)::float8 AS avg_delay_seconds
      FROM mv_olap_traffic_summary
      ${district ? 'WHERE district = $1' : ''}
      GROUP BY road_name
      ORDER BY road_name ASC`,
      ...(district ? [district] : [])
    );

    return rows.map((row) => ({
      roadName: row.road_name,
      designCapacity: Number(toFinite(row.design_capacity, 0).toFixed(2)),
      avgTrafficIndex: Number(toFinite(row.avg_traffic_index, 0).toFixed(3)),
      avgPcuVolume: Number(toFinite(row.avg_pcu_volume, 0).toFixed(2)),
      avgDelaySeconds: Number(toFinite(row.avg_delay_seconds, 0).toFixed(2)),
    }));
  }

  async getRoadDelayDrilldown(district?: string): Promise<OlapDrilldownPoint[]> {
    const rows = await prisma.$queryRawUnsafe<DrilldownRow[]>(
      `SELECT
        road_name AS label,
        AVG(avg_delay_seconds)::float8 AS avg_delay_seconds
      FROM mv_olap_traffic_summary
      ${district ? 'WHERE district = $1' : ''}
      GROUP BY road_name
      ORDER BY avg_delay_seconds DESC, road_name ASC`,
      ...(district ? [district] : [])
    );

    return rows.map((row) => ({
      label: row.label,
      avgDelaySeconds: Number(toFinite(row.avg_delay_seconds, 0).toFixed(2)),
    }));
  }

  async getSegmentDelayDrilldown(roadName: string, district?: string): Promise<OlapDrilldownPoint[]> {
    const rows = await prisma.$queryRawUnsafe<DrilldownRow[]>(
      `SELECT
        segment_id::text AS label,
        AVG(avg_delay_seconds)::float8 AS avg_delay_seconds
      FROM mv_olap_traffic_summary
      WHERE road_name = $1
      ${district ? 'AND district = $2' : ''}
      GROUP BY segment_id
      ORDER BY avg_delay_seconds DESC, segment_id ASC`,
      roadName,
      ...(district ? [district] : [])
    );

    return rows.map((row) => ({
      label: row.label,
      avgDelaySeconds: Number(toFinite(row.avg_delay_seconds, 0).toFixed(2)),
    }));
  }
}

export const olapMartService = new OlapMartService();
