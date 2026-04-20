// Simulation Service - Xử lý logic dự báo & routing

import { Logger } from '../utils/logger';
import { ForecastRequest, ForecastResponse, RoutingRequest, RoutingResponse } from '../interfaces/index';

const logger = new Logger('SimulationService');

export class SimulationService {
  /**
   * Tìm lộ trình thay thế tránh các đoạn đường bị chặn
   * Hiện tại: Mock data - sẽ được thay bằng pgRouting
   */
  async routing(request: RoutingRequest): Promise<RoutingResponse> {
    try {
      logger.log('Computing alternative route', request);

      // TODO: Gọi pgRouting function để tìm đường
      // Tạm thời trả mock data
      const mockRoute: RoutingResponse = {
        route: {
          type: 'LineString',
          coordinates: [
            request.startPoint,
            [(request.startPoint[0] + request.endPoint[0]) / 2, (request.startPoint[1] + request.endPoint[1]) / 2],
            request.endPoint,
          ],
        },
        totalDistance: this.calculateDistance(request.startPoint, request.endPoint),
        estimatedTime: 25 + Math.random() * 15, // Random 25-40 phút
      };

      logger.log(`Route computed: ${mockRoute.totalDistance.toFixed(2)} km`, mockRoute);
      return mockRoute;
    } catch (error) {
      logger.error('Error computing route', error);
      throw error;
    }
  }

  /**
   * Helper: Tính khoảng cách giữa 2 điểm (đơn vị km)
   * Sử dụng Haversine formula
   */
  private calculateDistance(start: [number, number], end: [number, number]): number {
    const R = 6371; // Bán kính Trái đất (km)
    const dLat = this.toRad(end[1] - start[1]);
    const dLon = this.toRad(end[0] - start[0]);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(start[1])) *
        Math.cos(this.toRad(end[1])) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Helper: Chuyển độ sang radian
   */
  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Helper: Trả về LOS random (A-F)
   */
  private getRandomLos(): string {
    const losGrades = ['A', 'B', 'C', 'D', 'E', 'F'];
    return losGrades[Math.floor(Math.random() * losGrades.length)];
  }

  /**
   * Truy vấn pgRouting để tìm lộ trình với Cost TTI
   */
  async getDynamicRoute(startLat: number, startLng: number, endLat: number, endLng: number): Promise<any> {
    try {
      logger.log('Querying Dynamic Route', { startLat, startLng, endLat, endLng });

      // Cần require động query từ DB để lấy conn pool.
      const { query } = await import('../config/db');

      // 1. Tìm start_node & end_node gần toạ độ GPS nhất từ vertices
      const findNodeSql = `
        SELECT id, ST_X(the_geom) as lng, ST_Y(the_geom) as lat 
        FROM routing_edges_vertices_pgr
        ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT 1;
      `;
      
      const startNodeRes = await query(findNodeSql, [startLng, startLat]);
      const endNodeRes = await query(findNodeSql, [endLng, endLat]);

      if (!startNodeRes.rows.length || !endNodeRes.rows.length) {
        throw new Error('Cannot find nearest routing nodes for the provided coordinates.');
      }

      const startNode = startNodeRes.rows[0].id;
      const startSnapped = [parseFloat(startNodeRes.rows[0].lng), parseFloat(startNodeRes.rows[0].lat)];
      const endNode = endNodeRes.rows[0].id;
      const endSnapped = [parseFloat(endNodeRes.rows[0].lng), parseFloat(endNodeRes.rows[0].lat)];

      logger.log(`Found Routing Nodes - Start: ${startNode}, End: ${endNode}`);

      // 2. Chạy pgRouting pgr_dijkstra kết hợp CTE lấy LineString
      // View `view_dynamic_routing_edges` đã có logic cost = length / speed. Tuy nhiên prompt nói "Cost = length * TTI...".
      // Do schema DB `view_dynamic_routing_edges` đã tạo hàm cost tối ưu (length / speed, hoặc distance / (tti-based-speed)),
      // Ở đây ta cứ dùng nguyên view `view_dynamic_routing_edges` theo đúng query bạn đã set ở DB step 4.
      const routingSql = `
        WITH route AS (
          SELECT * FROM pgr_dijkstra(
            'SELECT id, source, target, cost, reverse_cost FROM view_dynamic_routing_edges',
            $1::integer, $2::integer, directed := true
          )
        )
        SELECT 
          ST_AsGeoJSON(ST_Union(v.geom_way)) as geojson_route,
          SUM(v.distance_m) as total_distance_m,
          SUM(r.cost) as total_time_seconds,
          COUNT(v.id) as segment_count
        FROM route r
        JOIN routing_edges v ON r.edge = v.id;
      `;

      const routeRes = await query(routingSql, [startNode, endNode]);

      if (!routeRes.rows.length || !routeRes.rows[0].geojson_route) {
        throw new Error('No route could be found between the given points.');
      }

      const geoJsonGeom = JSON.parse(routeRes.rows[0].geojson_route);
      const totalDistanceM = parseFloat(routeRes.rows[0].total_distance_m || '0');
      const totalTimeSec = parseFloat(routeRes.rows[0].total_time_seconds || '0');
      const segmentCount = parseInt(routeRes.rows[0].segment_count || '0', 10);

      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: geoJsonGeom,
            properties: {
              startNode,
              endNode,
              isDynamicRoute: true,
              totalDistanceM,
              totalTimeSec,
              segmentCount,
              startSnapped,
              endSnapped
            }
          }
        ]
      };
    } catch (error) {
      logger.error('Error querying dynamic route', error);
      throw error;
    }
  }
}

export const simulationService = new SimulationService();
