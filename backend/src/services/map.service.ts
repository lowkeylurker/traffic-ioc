// Map Service - Xử lý logic lấy dữ liệu đoạn đường và trạng thái giao thông
// Sử dụng pg Pool trực tiếp (thay prisma.$queryRaw) để hỗ trợ PostGIS

import { query } from '../config/db';
import { prisma } from '../config/prisma';
import { TrafficStatus } from '../interfaces/index';
import { COLOR_RULES, GeoJSONFeature, TrafficMapResponse } from '../interfaces/map.interface';
import { Logger } from '../utils/logger';

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
  private cachedTopologyMap: TrafficMapResponse | null = null;
  private lastTopologyFetch: number = 0;

  /**
   * Get color based on LOS level (A-F)
   */
  private getColorByLOS(losLevel: string | null): string | null {
    if (!losLevel || losLevel === 'N/A') return null;

    switch (losLevel.toUpperCase()) {
      case 'A':
      case 'B':
      case 'C':
        return COLOR_RULES.GREEN;
      case 'D':
        return COLOR_RULES.ORANGE;
      case 'E':
        return COLOR_RULES.RED_ORANGE;
      case 'F':
        return COLOR_RULES.RED;
      default:
        return null;
    }
  }

  /**
   * GET /api/v1/map/segments – Return GeoJSON FeatureCollection with color by LOS
   */
  async getTrafficMap(): Promise<TrafficMapResponse> {
    try {
      const nowMs = Date.now();
      // Cache for 1 hour (3600000 ms) because topology rarely changes
      if (this.cachedTopologyMap && nowMs - this.lastTopologyFetch < 3600000) {
        return this.cachedTopologyMap;
      }

      logger.log('Fetching map topology data from DB');

      let rows: any[] = [];
      try {
        rows = await prisma.$queryRaw<any[]>`
          SELECT
            s.segment_key::text as "segmentId",
            s.segment_id_source::text as "segmentName",
            w.road_key::text as "roadKey",
            r.name as "roadName",
            EXISTS (
              SELECT 1
              FROM bridge_corridor_segment bcs
              WHERE bcs.segment_key = s.segment_key
            ) as "isCorridor",
            ST_AsGeoJSON(ST_Simplify(s.geometry_linestring, 0.00005), 6)::json as geometry
          FROM dim_segment s
          LEFT JOIN dim_way w ON w.way_key = s.way_key
          LEFT JOIN dim_road r ON r.road_key = w.road_key
          WHERE s.geometry_linestring IS NOT NULL
          ORDER BY s.segment_key
        `;
      } catch (error) {
        logger.warn('Corridor mapping table unavailable, fallback to topology-only query', error);

        rows = await prisma.$queryRaw<any[]>`
          SELECT
            s.segment_key::text as "segmentId",
            s.segment_id_source::text as "segmentName",
            w.road_key::text as "roadKey",
            r.name as "roadName",
            false as "isCorridor",
            ST_AsGeoJSON(ST_Simplify(s.geometry_linestring, 0.00005), 6)::json as geometry
          FROM dim_segment s
          LEFT JOIN dim_way w ON w.way_key = s.way_key
          LEFT JOIN dim_road r ON r.road_key = w.road_key
          WHERE s.geometry_linestring IS NOT NULL
          ORDER BY s.segment_key
        `;
      }

      // One-pass transform from DB rows to GeoJSON features.
      const features: GeoJSONFeature[] = rows.map((row: any) => {
        return {
          type: 'Feature',
          geometry: row.geometry,
          properties: {
            segmentId: row.segmentId,
            segmentName: row.segmentName,
            roadKey: row.roadKey,
            roadName: row.roadName,
            isCorridor: row.isCorridor,
          },
        };
      });

      this.cachedTopologyMap = { type: 'FeatureCollection', features };
      this.lastTopologyFetch = nowMs;

      return this.cachedTopologyMap;
    } catch (error) {
      logger.error('Error fetching traffic map topology', error);
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
   * Lấy danh sách tuyến đường
   */
  async getRoads(): Promise<Array<{ roadKey: string; roadName: string }>> {
    try {
      logger.log('Fetching all roads');

      const result = await query(`
        SELECT
          road_key::text AS "roadKey",
          name AS "roadName"
        FROM dim_road
        WHERE name IS NOT NULL
        ORDER BY name ASC
      `);

      return result.rows as Array<{ roadKey: string; roadName: string }>;
    } catch (error) {
      logger.error('Error fetching roads', error);
      throw error;
    }
  }

  /**
   * Lấy trạng thái giao thông hiện tại của tất cả đoạn đường
   */
  async getTrafficStatus(): Promise<TrafficStatus[]> {
    try {
      logger.log('Fetching traffic status (dynamic flow)');

      const result = await query(`
        WITH latest_flow AS (
          SELECT DISTINCT ON (segment_key)
            segment_key, current_speed_kmh, los_level, traffic_index, pcu_volume, timestamp
          FROM fact_traffic_flow
          ORDER BY segment_key, timestamp DESC
        )
        SELECT
          f.segment_key          AS "segmentId",
          s.segment_id_source::text AS "segmentName",
          f.current_speed_kmh    AS "currentSpeed",
          f.current_speed_kmh    AS "avgSpeed",
          f.los_level            AS "losGrade",
          f.traffic_index        AS "losScore",
          f.pcu_volume           AS "pcuValue",
          NULL::float            AS "occupancyRate",
          EXISTS (
            SELECT 1
            FROM bridge_corridor_segment bcs
            WHERE bcs.segment_key = f.segment_key
          )                     AS "isCorridor",
          f.timestamp            AS timestamp
        FROM latest_flow f
        LEFT JOIN dim_segment s ON f.segment_key = s.segment_key
        WHERE s.geometry_linestring IS NOT NULL
      `);

      logger.log(`Retrieved traffic status for ${result.rows.length} segments`);

      // Inject colors directly in result
      return result.rows.map((row) => ({
        ...row,
        color: this.getColorByLOS(row.losGrade),
      })) as TrafficStatus[];
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

      const result = await query(
        `
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
      `,
        [segmentId]
      );

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
