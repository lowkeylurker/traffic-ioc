// Simulation Service - Xử lý logic dự báo & routing

import { Logger } from '../utils/logger';
import { ForecastRequest, ForecastResponse, RoutingRequest, RoutingResponse } from '../interfaces/index';
import { FeatureCollection } from 'geojson';

const logger = new Logger('SimulationService');

type RouteComputation = {
  route: FeatureCollection;
  distance: number;
  duration: number;
  segmentIds: string[];
};

type RoutingBBox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export class SimulationService {
  /**
   * Tìm lộ trình thay thế tránh các đoạn đường bị chặn sử dụng pgRouting
   */
  async routing(request: RoutingRequest): Promise<RoutingResponse> {
    try {
      const { startPoint, endPoint, blockedSegments = [] } = request;

      // Keep as strings to avoid precision loss with BigInt in JS Number
      const blockedIds = Array.from(
        new Set(
          blockedSegments
            .map((segmentId) => String(segmentId))
            .filter((segmentId) => /^\d+$/.test(segmentId))
        )
      );

      logger.log('Computing simulation route with blocks', {
        startPoint,
        endPoint,
        blockedCount: blockedIds.length,
      });

      const { query } = await import('../config/db');

      // 1. Tìm start_node & end_node gần toạ độ GPS nhất
      const findNodeSql = `
        SELECT id FROM routing_edges_vertices_pgr
        ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT 1;
      `;

      const startNodeRes = await query(findNodeSql, [startPoint[0], startPoint[1]]);
      const endNodeRes = await query(findNodeSql, [endPoint[0], endPoint[1]]);

      if (!startNodeRes.rows.length || !endNodeRes.rows.length) {
        throw new Error('Cannot find nearest routing nodes for simulation.');
      }

      const startNode = startNodeRes.rows[0].id;
      const endNode = endNodeRes.rows[0].id;
      const expandedBlockedIds = await this.expandBlockedRouteEdges(blockedIds, query);

      const computeRoute = async (excludedSegmentIds: string[]): Promise<RouteComputation> => {
        const blockedFilter =
          excludedSegmentIds.length > 0
            ? `AND id NOT IN (${excludedSegmentIds.join(',')})`
            : '';
        const bboxBuffers = [0.01, 0.03, 0.07];

        for (const bufferDegrees of bboxBuffers) {
          const bbox = this.createRoutingBBox(startPoint, endPoint, bufferDegrees);
          const edgeSql = `
            SELECT id, source, target, cost, reverse_cost, x1, y1, x2, y2
            FROM view_dynamic_routing_edges
            WHERE geom && ST_MakeEnvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326)
            ${blockedFilter}
          `;

          const routingSql = `
            WITH route AS (
              SELECT * FROM pgr_bdAstar(
                '${edgeSql}',
                $1::bigint, $2::bigint, directed := true
              )
            ),
            route_features AS (
              SELECT
                r.seq,
                r.edge AS edge_id,
                v.travel_time AS edge_time,
                v.travel_distance AS edge_distance,
                json_build_object(
                  'type', 'Feature',
                  'geometry', ST_AsGeoJSON(COALESCE(s.geometry_linestring, v.geom))::json,
                  'properties', jsonb_build_object(
                    'routeSeq', r.seq,
                    'segmentId', r.edge::text,
                    'travelTime', v.travel_time,
                    'travelDistance', v.travel_distance
                  )
                ) AS feature
              FROM route r
              INNER JOIN view_dynamic_routing_edges v ON r.edge = v.id
              LEFT JOIN dim_segment s ON r.edge = s.segment_key
              WHERE r.edge <> -1
              ORDER BY r.seq
            )
            SELECT
              json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(feature ORDER BY seq), '[]'::json)
              ) AS route_json,
              COALESCE(SUM(edge_distance), 0) AS total_dist,
              COALESCE(SUM(edge_time), 0) AS total_time,
              COALESCE(array_agg(edge_id::text ORDER BY seq), ARRAY[]::text[]) AS route_segment_ids
            FROM route_features;
          `;

          const routeRes = await query(routingSql, [startNode, endNode]);
          const row = routeRes.rows[0];

          if (row && Number(row.total_dist) > 0 && row.route_json) {
            return {
              route: row.route_json,
              distance: Number((Number(row.total_dist) / 1000).toFixed(2)),
              duration: Number(Number(row.total_time).toFixed(0)),
              segmentIds: row.route_segment_ids || [],
            };
          }

          logger.warn('No simulation route found inside bbox, retrying with wider bounds', {
            bufferDegrees,
            excludedCount: excludedSegmentIds.length,
          });
        }

        throw new Error('No route found. The closure might have isolated the destination.');
      };

      const baseline = await computeRoute([]);
      let rerouted: RouteComputation | null = null;
      let rerouteFailureReason: string | undefined;

      try {
        rerouted = await computeRoute(expandedBlockedIds);
      } catch (error) {
        rerouteFailureReason =
          'Không tìm thấy tuyến thay thế sau khi áp dụng các đoạn đường bị đóng. Điểm đến có thể đã bị cô lập.';
        logger.warn('Simulation reroute unavailable', {
          error: error instanceof Error ? error.message : String(error),
          blockedCount: expandedBlockedIds.length,
        });
      }

      const blockedRouteSegments = rerouted
        ? rerouted.segmentIds.filter((segmentId) => expandedBlockedIds.includes(segmentId))
        : [];
      if (blockedRouteSegments.length > 0) {
        logger.warn('Rerouted path still contains blocked route segments', {
          blockedRouteSegments,
        });
      }
      const result: RoutingResponse = {
        baseline: {
          route: baseline.route,
          distance: baseline.distance,
          duration: baseline.duration,
        },
        rerouted: {
          route: rerouted?.route || {
            type: 'FeatureCollection',
            features: [],
          },
          distance: rerouted?.distance || 0,
          duration: rerouted?.duration || 0,
        },
        blockedSegments: blockedIds,
        expandedBlockedSegments: expandedBlockedIds,
        blockedRouteSegments,
        rerouteAvailable: Boolean(rerouted),
        rerouteFailureReason,
      };

      logger.log('Simulation route computed', {
        baselineDistanceKm: baseline.distance,
        reroutedDistanceKm: rerouted?.distance || 0,
        rerouteAvailable: Boolean(rerouted),
      });
      return result;
    } catch (error) {
      logger.error('Error computing simulation route', error);
      throw error;
    }
  }

  private async expandBlockedRouteEdges(
    blockedSegmentIds: string[],
    query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
  ): Promise<string[]> {
    if (blockedSegmentIds.length === 0) {
      return [];
    }

    const sql = `
      WITH requested AS (
        SELECT unnest($1::text[])::bigint AS segment_key
      ),
      blocked AS (
        SELECT
          s.segment_key,
          s.from_node_key,
          s.to_node_key,
          s.geometry_linestring
        FROM dim_segment s
        INNER JOIN requested r ON r.segment_key = s.segment_key
        WHERE s.geometry_linestring IS NOT NULL
      ),
      bbox AS (
        SELECT ST_Expand(ST_Extent(geometry_linestring), 0.001) as area
        FROM blocked
      )
      SELECT DISTINCT r.id::text AS id
      FROM routing_edges r
      CROSS JOIN bbox
      INNER JOIN dim_segment rs ON rs.segment_key = r.id
      INNER JOIN blocked b ON
        r.id = b.segment_key
        OR (rs.from_node_key = b.to_node_key AND rs.to_node_key = b.from_node_key)
        OR (
          r.geom_way && ST_Expand(b.geometry_linestring, 0.0001)
          AND ST_DWithin(r.geom_way, b.geometry_linestring, 0.00008)
        )
      WHERE r.geom_way && bbox.area
    `;

    const result = await query(sql, [blockedSegmentIds]);
    const expandedIds = result.rows.map((row) => String(row.id));
    const mergedIds = Array.from(new Set([...blockedSegmentIds, ...expandedIds]));

    logger.log('Expanded blocked routing edges', {
      requestedCount: blockedSegmentIds.length,
      expandedCount: mergedIds.length,
    });

    return mergedIds;
  }

  private createRoutingBBox(
    startPoint: [number, number],
    endPoint: [number, number],
    bufferDegrees = 0.01
  ): RoutingBBox {
    const [startLng, startLat] = startPoint.map(Number) as [number, number];
    const [endLng, endLat] = endPoint.map(Number) as [number, number];

    if (![startLng, startLat, endLng, endLat].every(Number.isFinite)) {
      throw new Error('Invalid coordinates for simulation routing.');
    }

    return {
      minLng: Math.min(startLng, endLng) - bufferDegrees,
      minLat: Math.min(startLat, endLat) - bufferDegrees,
      maxLng: Math.max(startLng, endLng) + bufferDegrees,
      maxLat: Math.max(startLat, endLat) + bufferDegrees,
    };
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

      // 2. Chạy pgRouting pgr_bdAstar và build GeoJSON trực tiếp từ SQL
      const routingSql = `
        WITH route AS (
          SELECT * FROM pgr_bdAstar(
            'SELECT id, source, target, cost, reverse_cost, ST_X(ST_StartPoint(geom)) as x1, ST_Y(ST_StartPoint(geom)) as y1, ST_X(ST_EndPoint(geom)) as x2, ST_Y(ST_EndPoint(geom)) as y2 FROM view_dynamic_routing_edges',
            $1::integer, $2::integer, directed := true
          )
        ),
        route_features AS (
          SELECT
            v.travel_time as edge_time,
            v.travel_distance as edge_distance,
            json_build_object(
              'type', 'Feature',
              'geometry', ST_AsGeoJSON(ds.geometry_linestring)::json,
              'properties', jsonb_build_object(
                'route_seq', r.seq,
                'route_node', r.node,
                'route_edge', r.edge,
                'route_cost', r.cost,
                'route_agg_cost', r.agg_cost,
                'travel_time', v.travel_time,
                'travel_distance', v.travel_distance
              ) || (to_jsonb(ds.*) - 'geometry_linestring')
            ) AS feature
          FROM route r
          INNER JOIN view_dynamic_routing_edges v ON r.edge = v.id
          INNER JOIN dim_segment ds ON r.edge = ds.segment_key
          ORDER BY r.seq
        )
        SELECT
          json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(feature), '[]'::json)
          ) AS geojson,
          SUM(edge_distance) as total_distance_m,
          SUM(edge_time) as total_time_seconds,
          COUNT(feature) as segment_count
        FROM route_features;
      `;

      const routeRes = await query(routingSql, [startNode, endNode]);

      if (!routeRes.rows.length || !routeRes.rows[0].geojson) {
        throw new Error('No route could be found between the given points.');
      }

      const { geojson, total_distance_m, total_time_seconds, segment_count } = routeRes.rows[0];

      // Inject metadata vào cấp cao nhất của FeatureCollection mà không dùng vòng lặp
      geojson.properties = {
        startNode,
        endNode,
        startSnapped,
        endSnapped,
        isDynamicRoute: true,
        totalDistanceM: total_distance_m,
        totalTimeSec: total_time_seconds,
        segmentCount: parseInt(segment_count || '0', 10)
      };

      return geojson;
    } catch (error) {
      logger.error('Error querying dynamic route', error);
      throw error;
    }
  }
}

export const simulationService = new SimulationService();
