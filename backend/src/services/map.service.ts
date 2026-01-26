// Map Service - Xử lý logic lấy dữ liệu đoạn đường và trạng thái giao thông

import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';
import { TrafficSegment, TrafficStatus } from '../interfaces/index';

const logger = new Logger('MapService');

export class MapService {
  /**
   * Lấy danh sách tất cả đoạn đường dưới dạng GeoJSON
   * Sử dụng raw query để xử lý geometry
   */
  async getSegments(): Promise<any[]> {
    try {
      logger.log('Fetching all segments with GeoJSON');

      // Raw query để lấy geometry dưới dạng GeoJSON
      const segments = await prisma.$queryRaw`
        SELECT 
          segment_id as "segmentId",
          segment_name as "segmentName",
          ST_AsGeoJSON(geometry)::json as geometry,
          num_lanes as "numLanes",
          speed_limit_kmh as "speedLimit"
        FROM dim_segment
        ORDER BY segment_id
      `;

      logger.log(`Retrieved ${Array.isArray(segments) ? segments.length : 0} segments`);
      return segments as TrafficSegment[] || [];
    } catch (error) {
      logger.error('Error fetching segments', error);
      throw error;
    }
  }

  /**
   * Lấy trạng thái giao thông hiện tại của tất cả đoạn đường
   * Join dim_segment và fact_traffic_flow
   */
  async getTrafficStatus(): Promise<TrafficStatus[]> {
    try {
      logger.log('Fetching traffic status');

      // Raw query để join và lấy dữ liệu mới nhất
      const status = await prisma.$queryRaw`
        SELECT 
          s.segment_id as "segmentId",
          s.segment_name as "segmentName",
          f.current_speed as "currentSpeed",
          f.avg_speed as "avgSpeed",
          f.los_grade as "losGrade",
          f.los_score as "losScore",
          f.pcu_value as "pcuValue",
          f.occupancy_rate as "occupancyRate",
          f.created_at as timestamp
        FROM dim_segment s
        LEFT JOIN fact_traffic_flow f ON s.segment_id = f.segment_id
          AND f.flow_id = (
            SELECT flow_id FROM fact_traffic_flow 
            WHERE segment_id = s.segment_id 
            ORDER BY flow_id DESC LIMIT 1
          )
        ORDER BY s.segment_id
      `;

      logger.log(`Retrieved traffic status for ${Array.isArray(status) ? status.length : 0} segments`);
      return status as TrafficStatus[] || [];
    } catch (error) {
      logger.error('Error fetching traffic status', error);
      throw error;
    }
  }

  /**
   * Lấy trạng thái của một đoạn đường cụ thể
   */
  async getSegmentStatus(segmentId: number): Promise<TrafficStatus | null> {
    try {
      logger.log(`Fetching status for segment ${segmentId}`);

      const status = await prisma.$queryRaw`
        SELECT 
          s.segment_id as "segmentId",
          s.segment_name as "segmentName",
          f.current_speed as "currentSpeed",
          f.avg_speed as "avgSpeed",
          f.los_grade as "losGrade",
          f.los_score as "losScore",
          f.pcu_value as "pcuValue",
          f.occupancy_rate as "occupancyRate",
          f.created_at as timestamp
        FROM dim_segment s
        LEFT JOIN fact_traffic_flow f ON s.segment_id = f.segment_id
          AND f.flow_id = (
            SELECT flow_id FROM fact_traffic_flow 
            WHERE segment_id = s.segment_id 
            ORDER BY flow_id DESC LIMIT 1
          )
        WHERE s.segment_id = ${segmentId}
      `;

      const result = Array.isArray(status) && status.length > 0 ? status[0] : null;
      logger.log(`Retrieved status for segment ${segmentId}`, result ? 'Found' : 'Not found');
      return result as TrafficStatus | null;
    } catch (error) {
      logger.error(`Error fetching status for segment ${segmentId}`, error);
      throw error;
    }
  }
}

export const mapService = new MapService();
