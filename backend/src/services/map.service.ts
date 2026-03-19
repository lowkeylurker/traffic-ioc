// Map Service - Xử lý logic lấy dữ liệu đoạn đường và trạng thái giao thông

import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';
import { TrafficSegment, TrafficStatus } from '../interfaces/index';
import { GeoJSONFeature, TrafficMapResponse, COLOR_RULES } from '../interfaces/map.interface';

const logger = new Logger('MapService');

// Use real data from database
const USE_MOCK_DATA = false;

// Helper function to generate realistic HCMC road segments aligned with actual streets
function generateRealisticRoadsData(count: number = 5000): any {
  // Real street corridors in HCMC - approximate coordinates following actual street networks
  const streetCorridors: any[] = [
    // District 1 Main Streets
    {
      name: 'Đường Lê Duẩn',
      path: [
        [106.7, 10.775],
        [106.705, 10.78],
      ],
    },
    {
      name: 'Đường Pasteur',
      path: [
        [106.698, 10.782],
        [106.702, 10.778],
      ],
    },
    {
      name: 'Đường Trần Hưng Đạo',
      path: [
        [106.69, 10.77],
        [106.71, 10.785],
      ],
    },
    {
      name: 'Đường Nguyễn Huệ',
      path: [
        [106.698, 10.785],
        [106.71, 10.778],
      ],
    },
    {
      name: 'Đường Đồng Khởi',
      path: [
        [106.705, 10.775],
        [106.715, 10.785],
      ],
    },

    // District 3 & 4
    {
      name: 'Đường Cộng Hòa',
      path: [
        [106.68, 10.795],
        [106.7, 10.82],
      ],
    },
    {
      name: 'Đường Võ Văn Kiệt',
      path: [
        [106.69, 10.765],
        [106.71, 10.76],
      ],
    },
    {
      name: 'Đường Tôn Đức Thắng',
      path: [
        [106.695, 10.765],
        [106.715, 10.755],
      ],
    },

    // District 5 & 6
    {
      name: 'Đường Chu Văn An',
      path: [
        [106.675, 10.77],
        [106.695, 10.8],
      ],
    },
    {
      name: 'Đường Nguyễn Trãi',
      path: [
        [106.68, 10.76],
        [106.7, 10.79],
      ],
    },

    // District 7 & Bình Thạnh
    {
      name: 'Đường Tạ Uyên',
      path: [
        [106.72, 10.795],
        [106.74, 10.82],
      ],
    },
    {
      name: 'Đường Lê Văn Sỹ',
      path: [
        [106.725, 10.775],
        [106.745, 10.8],
      ],
    },

    // Surrounding areas
    {
      name: 'Đường Phạm Văn Đồng',
      path: [
        [106.75, 10.785],
        [106.77, 10.81],
      ],
    },
    {
      name: 'Đường Quốc Lộ 1A',
      path: [
        [106.7, 10.65],
        [106.71, 10.85],
      ],
    },
    {
      name: 'Đường Hoàng Hoa Thám',
      path: [
        [106.66, 10.8],
        [106.68, 10.83],
      ],
    },
    {
      name: 'Đường Bạch Đằng',
      path: [
        [106.7, 10.76],
        [106.72, 10.8],
      ],
    },
    {
      name: 'Đường Hai Bà Trưng',
      path: [
        [106.69, 10.79],
        [106.72, 10.81],
      ],
    },
    {
      name: 'Đường Mạc Thị Bưởi',
      path: [
        [106.695, 10.81],
        [106.715, 10.83],
      ],
    },
    {
      name: 'Đường Bùi Viện',
      path: [
        [106.69, 10.765],
        [106.705, 10.775],
      ],
    },
    {
      name: 'Đường Phạm Ngũ Lão',
      path: [
        [106.695, 10.77],
        [106.71, 10.78],
      ],
    },
  ];

  const features: GeoJSONFeature[] = [];
  const status: TrafficStatus[] = [];

  let segmentId = 1;
  for (const corridor of streetCorridors) {
    const segmentsPerCorridor = Math.floor(count / streetCorridors.length);

    for (let i = 0; i < segmentsPerCorridor && segmentId <= count; i++) {
      const [startLon, startLat] = corridor.path[0];
      const [endLon, endLat] = corridor.path[1];

      // Divide corridor into multiple small segments
      const segmentProgress = i / segmentsPerCorridor;
      const nextProgress = (i + 1) / segmentsPerCorridor;

      const segStartLon = startLon + (endLon - startLon) * segmentProgress;
      const segStartLat = startLat + (endLat - startLat) * segmentProgress;
      const segEndLon = startLon + (endLon - startLon) * nextProgress;
      const segEndLat = startLat + (endLat - startLat) * nextProgress;

      // Add slight randomness to avoid perfectly straight lines
      const randomOffsetStart = (Math.random() - 0.5) * 0.0005;
      const randomOffsetEnd = (Math.random() - 0.5) * 0.0005;

      const finalStartLon = segStartLon + randomOffsetStart;
      const finalStartLat = segStartLat + randomOffsetStart;
      const finalEndLon = segEndLon + randomOffsetEnd;
      const finalEndLat = segEndLat + randomOffsetEnd;

      // Generate realistic speed (10-70 km/h)
      const speed = Math.floor(Math.random() * 60) + 10;

      // Determine LOS and color based on speed
      let losGrade = 'A';
      let losIndex = 'A';
      let color: string = COLOR_RULES.GREEN;

      if (speed > 50) {
        losGrade = 'A';
        losIndex = 'A';
        color = COLOR_RULES.GREEN;
      } else if (speed > 40) {
        losGrade = 'B';
        losIndex = 'B';
        color = COLOR_RULES.GREEN;
      } else if (speed > 30) {
        losGrade = 'C';
        losIndex = 'C';
        color = COLOR_RULES.GREEN;
      } else if (speed > 20) {
        losGrade = 'D';
        losIndex = 'D';
        color = COLOR_RULES.ORANGE;
      } else if (speed > 10) {
        losGrade = 'E';
        losIndex = 'E';
        color = COLOR_RULES.ORANGE;
      } else {
        losGrade = 'F';
        losIndex = 'F';
        color = COLOR_RULES.RED;
      }

      const now = new Date().toISOString();

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [finalStartLon, finalStartLat],
            [finalEndLon, finalEndLat],
          ],
        },
        properties: {
          segmentId: segmentId,
          segmentName: `${corridor.name} - Segment ${i + 1}`,
          avgSpeed: speed,
          losIndex: losIndex,
          color: color,
          lastUpdated: now,
        },
      });

      status.push({
        segmentId: segmentId,
        segmentName: `${corridor.name} - Segment ${i + 1}`,
        currentSpeed: speed,
        avgSpeed: speed,
        losGrade: losGrade,
        losScore: speed / 70,
        pcuValue: Math.floor(Math.random() * 1500) + 100,
        occupancyRate: (70 - speed) / 70,
        timestamp: new Date(),
      });

      segmentId++;
    }
  }

  return { features, status };
}

const mockDataset = generateRealisticRoadsData(5000);
const MOCK_TRAFFIC_DATA = mockDataset.features;
const MOCK_TRAFFIC_STATUS = mockDataset.status;

export class MapService {
  /**
   * Get color based on speed
   */
  private getColorBySpeed(speed: number | null): string {
    if (speed === null || speed === undefined) {
      return COLOR_RULES.GREY;
    }
    if (speed < 15) {
      return COLOR_RULES.RED;
    }
    if (speed < 30) {
      return COLOR_RULES.ORANGE;
    }
    return COLOR_RULES.GREEN;
  }

  /**
   * Get traffic map response with color-coded segments
   */
  async getTrafficMap(): Promise<TrafficMapResponse> {
    try {
      if (USE_MOCK_DATA) {
        logger.log('Using mock data for traffic map');
        return {
          type: 'FeatureCollection',
          features: MOCK_TRAFFIC_DATA.map((feature: GeoJSONFeature) => ({
            ...feature,
            properties: {
              ...feature.properties,
              lastUpdated: new Date().toISOString(),
            },
          })),
        };
      }

      logger.log('Fetching traffic map data from database');
      const [segments, status] = await Promise.all([
        this.getSegments(),
        this.getTrafficStatus()
      ]);

      // Create a map for O(1) status lookup
      const statusMap = new Map(status.map(s => [s.segmentId, s]));

      // Map database data to GeoJSON format with color coding
      const features: GeoJSONFeature[] = segments.map((segment: any) => {
        const trafficInfo = statusMap.get(segment.segmentId);
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
            lastUpdated: trafficInfo?.timestamp?.toISOString() || new Date().toISOString(),
          },
        };
      });

      return {
        type: 'FeatureCollection',
        features,
      };
    } catch (error) {
      logger.error('Error fetching traffic map', error);
      throw error;
    }
  }

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
          segment_key::text as "segmentId",
          segment_id_source::text as "segmentName",
          ST_AsGeoJSON(geometry_linestring)::json as geometry,
          length_m as "numLanes",
          is_one_way as "speedLimit"
        FROM dim_segment
        WHERE geometry_linestring IS NOT NULL
        ORDER BY segment_key
        LIMIT 5000
      `;

      logger.log(`Retrieved ${Array.isArray(segments) ? segments.length : 0} segments`);
      return (segments as TrafficSegment[]) || [];
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
      if (USE_MOCK_DATA) {
        logger.log('Using mock data for traffic status');
        return MOCK_TRAFFIC_STATUS;
      }

      logger.log('Fetching traffic status');

      // Raw query to join and lấy dữ liệu mới nhất using DISTINCT ON for better performance
      const status = await prisma.$queryRaw`
        SELECT
          s.segment_key::text as "segmentId",
          s.segment_id_source::text as "segmentName",
          f.current_speed_kmh as "currentSpeed",
          f.current_speed_kmh as "avgSpeed",
          f.los_level as "losGrade",
          f.traffic_index as "losScore",
          f.pcu_volume as "pcuValue",
          NULL::float as "occupancyRate",
          f.timestamp as timestamp
        FROM dim_segment s
        LEFT JOIN (
          SELECT DISTINCT ON (segment_key) *
          FROM fact_traffic_flow
          ORDER BY segment_key, timestamp DESC
        ) f ON s.segment_key = f.segment_key
        WHERE s.geometry_linestring IS NOT NULL
        ORDER BY s.segment_key
        LIMIT 5000
      `;

      logger.log(`Retrieved traffic status for ${Array.isArray(status) ? status.length : 0} segments`);
      return (status as TrafficStatus[]) || [];
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
      if (USE_MOCK_DATA) {
        logger.log(`Using mock data for segment ${segmentId}`);
        return MOCK_TRAFFIC_STATUS.find((s: TrafficStatus) => s.segmentId === segmentId) || null;
      }

      logger.log(`Fetching status for segment ${segmentId}`);

      const status = await prisma.$queryRaw`
        SELECT
          s.segment_key::text as "segmentId",
          s.segment_id_source::text as "segmentName",
          f.current_speed_kmh as "currentSpeed",
          f.current_speed_kmh as "avgSpeed",
          f.los_level as "losGrade",
          f.traffic_index as "losScore",
          f.pcu_volume as "pcuValue",
          NULL::float as "occupancyRate",
          f.timestamp as timestamp
        FROM dim_segment s
        LEFT JOIN fact_traffic_flow f ON s.segment_key = f.segment_key
          AND f.traffic_flow_key = (
            SELECT traffic_flow_key FROM fact_traffic_flow
            WHERE segment_key = s.segment_key
            ORDER BY timestamp DESC LIMIT 1
          )
        WHERE s.segment_key = ${segmentId}
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
