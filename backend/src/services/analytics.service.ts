// Analytics Service - Xử lý logic phân tích & thống kê

import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';
import { VehicleMixData } from '../interfaces/index';

const logger = new Logger('AnalyticsService');

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
      return comparison as any[] || [];
    } catch (error) {
      logger.error('Error fetching speed comparison data', error);
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
      return ranking as any[] || [];
    } catch (error) {
      logger.error('Error fetching reliability ranking', error);
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();
