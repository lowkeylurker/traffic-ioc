// Map Service - Xử lý logic lấy dữ liệu đoạn đường và trạng thái giao thông
// Sử dụng pg Pool trực tiếp (thay prisma.$queryRaw) để hỗ trợ PostGIS

import { query } from '../config/db';
import { Logger } from '../utils/logger';
import { TrafficSegment, TrafficStatus } from '../interfaces/index';
import { GeoJSONFeature, TrafficMapResponse, COLOR_RULES } from '../interfaces/map.interface';

const logger = new Logger('MapService');

// Real data from the database
const USE_MOCK_DATA = false;

export class MapService {
  /**
   * Get color based on speed
   */
  private getColorBySpeed(speed: number | null): string {
    if (speed === null || speed === undefined) return COLOR_RULES.GREY;
    if (speed < 15) return COLOR_RULES.RED;
    if (speed < 30) return COLOR_RULES.ORANGE;
    return COLOR_RULES.GREEN;
  }

  /**
   * GET /api/v1/map/segments – Return GeoJSON FeatureCollection with color by LOS
   */
  async getTrafficMap(): Promise<TrafficMapResponse> {
    try {
      logger.log('Fetching traffic map data from database');
      const segments = await this.getSegments();
      const status = await this.getTrafficStatus();

      const features: GeoJSONFeature[] = segments.map((segment: any) => {
        const trafficInfo = status.find((s: TrafficStatus) => s.segmentId === segment.segmentId);
        const speed = trafficInfo?.avgSpeed || null;
        const color = this.getColorBySpeed(speed);

        return {
          type: 'Feature',
          geometry: segment.geometry,
          properties: {
            segmentId: segment.segmentId,
            segmentName: segment.segmentName,
            avgSpeed: speed || 0,
            losIndex: trafficInfo?.losGrade || 'N/A',
            color,
            lastUpdated: trafficInfo?.timestamp?.toISOString?.() || new Date().toISOString(),
          },
        };
      });

      return { type: 'FeatureCollection', features };
    } catch (error) {
      logger.error('Error fetching traffic map', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách tất cả đoạn đường dưới dạng GeoJSON
   */
  async getSegments(): Promise<any[]> {
    try {
      logger.log('Fetching all segments with GeoJSON');

      const result = await query(`
        SELECT
          segment_key        AS "segmentId",
          segment_id_source::text AS "segmentName",
          ST_AsGeoJSON(geometry_linestring)::json AS geometry,
          length_m           AS "numLanes",
          is_one_way         AS "speedLimit"
        FROM dim_segment
        WHERE geometry_linestring IS NOT NULL
        ORDER BY segment_key
        LIMIT 5000
      `);

      logger.log(`Retrieved ${result.rows.length} segments`);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching segments', error);
      throw error;
    }
  }

  /**
   * Lấy trạng thái giao thông hiện tại của tất cả đoạn đường
   */
  async getTrafficStatus(): Promise<TrafficStatus[]> {
    try {
      logger.log('Fetching traffic status');

      const result = await query(`
        SELECT
          s.segment_key          AS "segmentId",
          s.segment_id_source::text AS "segmentName",
          f.current_speed_kmh    AS "currentSpeed",
          f.current_speed_kmh    AS "avgSpeed",
          f.los_level            AS "losGrade",
          f.traffic_index        AS "losScore",
          f.pcu_volume           AS "pcuValue",
          NULL::float            AS "occupancyRate",
          f.timestamp            AS timestamp
        FROM dim_segment s
        LEFT JOIN LATERAL (
          SELECT *
          FROM fact_traffic_flow ftf
          WHERE ftf.segment_key = s.segment_key
          ORDER BY ftf.timestamp DESC
          LIMIT 1
        ) f ON TRUE
        WHERE s.geometry_linestring IS NOT NULL
        ORDER BY s.segment_key
        LIMIT 5000
      `);

      logger.log(`Retrieved traffic status for ${result.rows.length} segments`);
      return result.rows as TrafficStatus[];
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

      const result = await query(`
        SELECT
          s.segment_key          AS "segmentId",
          s.segment_id_source::text AS "segmentName",
          f.current_speed_kmh    AS "currentSpeed",
          f.current_speed_kmh    AS "avgSpeed",
          f.los_level            AS "losGrade",
          f.traffic_index        AS "losScore",
          f.pcu_volume           AS "pcuValue",
          NULL::float            AS "occupancyRate",
          f.timestamp            AS timestamp
        FROM dim_segment s
        LEFT JOIN LATERAL (
          SELECT *
          FROM fact_traffic_flow ftf
          WHERE ftf.segment_key = s.segment_key
          ORDER BY ftf.timestamp DESC
          LIMIT 1
        ) f ON TRUE
        WHERE s.segment_key = $1
      `, [segmentId]);

      const result_row = result.rows.length > 0 ? result.rows[0] : null;
      logger.log(`Segment ${segmentId}: ${result_row ? 'Found' : 'Not found'}`);
      return result_row as TrafficStatus | null;
    } catch (error) {
      logger.error(`Error fetching status for segment ${segmentId}`, error);
      throw error;
    }
  }
}

export const mapService = new MapService();
