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

interface DistrictRankingRow {
  district: string;
  avg_traffic_index: number;
  avg_vc_ratio: number;
  total_delay_seconds: number;
}

interface RoadTypeComparisonRow {
  osm_highway_type: string;
  avg_traffic_index: number;
  avg_vc_ratio: number;
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

export type OlapPeriod = 'weekly' | 'monthly' | 'all';

export class OlapMartService {
  private getViewName(period?: string): string {
    switch (period) {
      case 'weekly':
        return 'mv_olap_traffic_summary_weekly';
      case 'monthly':
        return 'mv_olap_traffic_summary_monthly';
      default:
        return 'mv_olap_traffic_summary';
    }
  }

  async refreshMaterializedView(): Promise<void> {
    try {
      logger.log('Refreshing OLAP materialized views...');
      await Promise.all([
        prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_olap_traffic_summary;'),
        prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_olap_traffic_summary_weekly;'),
        prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_olap_traffic_summary_monthly;')
      ]);
      logger.log('All OLAP materialized views refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh OLAP materialized views', error);
      throw error;
    }
  }

  async getHeatmap(district?: string, period?: string, roadTypes?: string[]): Promise<Array<[number, string, number]>> {
    const viewName = this.getViewName(period);
    const roadTypeFilter = roadTypes && roadTypes.length > 0 
      ? `AND osm_highway_type = ANY($${district ? 2 : 1}::text[])` 
      : '';
    
    const rows = await prisma.$queryRawUnsafe<HeatmapRow[]>(
      `SELECT
        hour_of_day,
        road_name,
        AVG(avg_traffic_index)::float8 AS avg_traffic_index
      FROM ${viewName}
      WHERE 1=1
      ${district ? 'AND district = $1' : ''}
      ${roadTypeFilter}
      GROUP BY hour_of_day, road_name
      ORDER BY road_name ASC, hour_of_day ASC`,
      ...(district ? [district] : []),
      ...(roadTypes && roadTypes.length > 0 ? [roadTypes] : [])
    );

    return rows.map((row) => [
      Math.max(0, Math.min(23, Math.round(toFinite(row.hour_of_day, 0)))),
      row.road_name,
      Number(toFinite(row.avg_traffic_index, 0).toFixed(3)),
    ]);
  }

  async getCrossAnalysis(district?: string, period?: string, roadTypes?: string[]): Promise<OlapCrossAnalysisPoint[]> {
    const viewName = this.getViewName(period);
    const roadTypeFilter = roadTypes && roadTypes.length > 0 
      ? `AND osm_highway_type = ANY($${district ? 2 : 1}::text[])` 
      : '';

    const rows = await prisma.$queryRawUnsafe<CrossAnalysisRow[]>(
      `SELECT
        road_name,
        AVG(design_capacity)::float8 AS design_capacity,
        AVG(avg_traffic_index)::float8 AS avg_traffic_index,
        AVG(avg_pcu_volume)::float8 AS avg_pcu_volume,
        AVG(avg_delay_seconds)::float8 AS avg_delay_seconds
      FROM ${viewName}
      WHERE 1=1
      ${district ? 'AND district = $1' : ''}
      ${roadTypeFilter}
      GROUP BY road_name
      ORDER BY road_name ASC`,
      ...(district ? [district] : []),
      ...(roadTypes && roadTypes.length > 0 ? [roadTypes] : [])
    );

    return rows.map((row) => ({
      roadName: row.road_name,
      designCapacity: Number(toFinite(row.design_capacity, 0).toFixed(2)),
      avgTrafficIndex: Number(toFinite(row.avg_traffic_index, 0).toFixed(3)),
      avgPcuVolume: Number(toFinite(row.avg_pcu_volume, 0).toFixed(2)),
      avgDelaySeconds: Number(toFinite(row.avg_delay_seconds, 0).toFixed(2)),
    }));
  }

  async getRoadDelayDrilldown(district?: string, period?: string, roadTypes?: string[]): Promise<OlapDrilldownPoint[]> {
    const viewName = this.getViewName(period);
    const roadTypeFilter = roadTypes && roadTypes.length > 0 
      ? `AND osm_highway_type = ANY($${district ? 2 : 1}::text[])` 
      : '';

    const rows = await prisma.$queryRawUnsafe<DrilldownRow[]>(
      `SELECT
        road_name AS label,
        AVG(avg_delay_seconds)::float8 AS avg_delay_seconds
      FROM ${viewName}
      WHERE 1=1
      ${district ? 'AND district = $1' : ''}
      ${roadTypeFilter}
      GROUP BY road_name
      ORDER BY avg_delay_seconds DESC, road_name ASC
      LIMIT 25`,
      ...(district ? [district] : []),
      ...(roadTypes && roadTypes.length > 0 ? [roadTypes] : [])
    );

    return rows.map((row) => ({
      label: row.label,
      avgDelaySeconds: Number(toFinite(row.avg_delay_seconds, 0).toFixed(2)),
    }));
  }

  async getSegmentDelayDrilldown(roadName: string, district?: string, period?: string, roadTypes?: string[]): Promise<OlapDrilldownPoint[]> {
    const viewName = this.getViewName(period);
    const roadTypeFilter = roadTypes && roadTypes.length > 0 
      ? `AND osm_highway_type = ANY($${district ? 3 : 2}::text[])` 
      : '';

    const rows = await prisma.$queryRawUnsafe<DrilldownRow[]>(
      `SELECT
        segment_id::text AS label,
        AVG(avg_delay_seconds)::float8 AS avg_delay_seconds
      FROM ${viewName}
      WHERE road_name = $1
      ${district ? 'AND district = $2' : ''}
      ${roadTypeFilter}
      GROUP BY segment_id
      ORDER BY avg_delay_seconds DESC, segment_id ASC`,
      roadName,
      ...(district ? [district] : []),
      ...(roadTypes && roadTypes.length > 0 ? [roadTypes] : [])
    );

    return rows.map((row) => ({
      label: row.label,
      avgDelaySeconds: Number(toFinite(row.avg_delay_seconds, 0).toFixed(2)),
    }));
  }

  async getSummary(district?: string, period?: string, roadTypes?: string[]) {
    const viewName = this.getViewName(period);
    const roadTypeFilter = roadTypes && roadTypes.length > 0 
      ? `AND osm_highway_type = ANY($${district ? 2 : 1}::text[])` 
      : '';

    const stats = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        AVG(avg_pcu_volume / NULLIF(design_capacity, 0))::float8 AS avg_vc_ratio,
        AVG(avg_delay_seconds)::float8 AS avg_delay_seconds,
        AVG(avg_traffic_index)::float8 AS avg_traffic_index,
        COUNT(DISTINCT road_name)::int AS road_count,
        SUM(CASE WHEN avg_traffic_index > 0.6 THEN 1 ELSE 0 END)::float8 / COUNT(*)::float8 AS congestion_rate
      FROM ${viewName}
      WHERE 1=1
      ${district ? 'AND district = $1' : ''}
      ${roadTypeFilter}`,
      ...(district ? [district] : []),
      ...(roadTypes && roadTypes.length > 0 ? [roadTypes] : [])
    );

    const row = stats[0] || {};
    
    // Calculate economic impact (mock formula: delay hours * 50,000 VND/hour)
    // Multiplied by days in period to get accumulated loss
    const daysMultiplier = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 1;
    const economicLoss = (toFinite(row.avg_delay_seconds) / 3600) * toFinite(row.avg_pcu_volume, 1000) * 50000 * 24 * daysMultiplier;

    return {
      avgVcRatio: Number(toFinite(row.avg_vc_ratio, 0).toFixed(3)),
      avgDelaySeconds: Number(toFinite(row.avg_delay_seconds, 0).toFixed(1)),
      avgTrafficIndex: Number(toFinite(row.avg_traffic_index, 0).toFixed(3)),
      roadCount: row.road_count || 0,
      congestionRate: Number(toFinite(row.congestion_rate, 0).toFixed(3)),
      economicLoss: Math.round(economicLoss),
      reliabilityIndex: Number((1 - toFinite(row.avg_traffic_index, 0.5) * 0.4).toFixed(2)) // Mock reliability logic
    };
  }

  async getDistrictRanking(period?: string, roadTypes?: string[]) {
    const viewName = this.getViewName(period);
    const roadTypeFilter = roadTypes && roadTypes.length > 0 
      ? `AND osm_highway_type = ANY($1::text[])` 
      : '';

    const rows = await prisma.$queryRawUnsafe<DistrictRankingRow[]>(
      `SELECT
        district,
        AVG(avg_traffic_index)::float8 AS avg_traffic_index,
        AVG(avg_pcu_volume / NULLIF(design_capacity, 0))::float8 AS avg_vc_ratio,
        SUM(avg_delay_seconds)::float8 AS total_delay_seconds
      FROM ${viewName}
      WHERE 1=1
      ${roadTypeFilter}
      GROUP BY district
      ORDER BY avg_traffic_index DESC`,
      ...(roadTypes && roadTypes.length > 0 ? [roadTypes] : [])
    );

    return rows.map((row) => ({
      district: row.district,
      avgTrafficIndex: Number(toFinite(row.avg_traffic_index, 0).toFixed(3)),
      avgVcRatio: Number(toFinite(row.avg_vc_ratio, 0).toFixed(3)),
      totalDelaySeconds: Math.round(toFinite(row.total_delay_seconds, 0))
    }));
  }

  async getRoadTypeComparison(period?: string) {
    const viewName = this.getViewName(period);

    const rows = await prisma.$queryRawUnsafe<RoadTypeComparisonRow[]>(
      `SELECT
        osm_highway_type,
        AVG(avg_traffic_index)::float8 AS avg_traffic_index,
        AVG(avg_pcu_volume / NULLIF(design_capacity, 0))::float8 AS avg_vc_ratio
      FROM ${viewName}
      GROUP BY osm_highway_type
      ORDER BY avg_traffic_index DESC`
    );

    return rows.map((row) => ({
      type: row.osm_highway_type,
      avgTrafficIndex: Number(toFinite(row.avg_traffic_index, 0).toFixed(3)),
      avgVcRatio: Number(toFinite(row.avg_vc_ratio, 0).toFixed(3))
    }));
  }
}

export const olapMartService = new OlapMartService();
