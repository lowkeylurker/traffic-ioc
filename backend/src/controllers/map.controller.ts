// Map Controller - Xử lý HTTP requests cho Map module

import { NextFunction, Request, Response } from 'express';
import { mapService } from '../services/map.service';
import { Logger } from '../utils/logger';
import { ResponseUtil } from '../utils/response';

const logger = new Logger('MapController');

export class MapController {
  /**
   * GET /api/v1/map/segments - Lấy bản đồ giao thông với mã màu (GeoJSON)
   */
  async getTrafficMap(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /api/v1/map/segments');
      const trafficMap = await mapService.getTrafficMap();
      res.json(ResponseUtil.success(trafficMap, 'Traffic map retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }


  /**
   * GET /roads - Lấy danh sách tuyến đường
   */
  async getRoads(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /roads');
      const roads = await mapService.getRoads();
      res.json(ResponseUtil.success(roads, 'Roads retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /status - Lấy trạng thái giao thông hiện tại
   */
  async getTrafficStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /status');
      const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
      const status = await mapService.getTrafficStatus(asOf);
      res.json(ResponseUtil.success(status, 'Traffic status retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /status/snapshots - Danh sách mốc giờ có dữ liệu traffic
   */
  async getTrafficStatusSnapshots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.log('GET /status/snapshots');

      const limitValue = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
      const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 500) : 100;
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      const start = typeof req.query.start === 'string' ? req.query.start : undefined;
      const end = typeof req.query.end === 'string' ? req.query.end : undefined;

      const snapshots = await mapService.getTrafficStatusSnapshots({ limit, before, start, end });
      res.json(ResponseUtil.success(snapshots, 'Traffic status snapshots retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /roads/:roadKey/segments - Lấy danh sách segment_key của một trục đường
   */
  async getRoadSegments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roadKey } = req.params;
      logger.log(`GET /roads/${roadKey}/segments`);
      const segments = await mapService.getRoadSegments(roadKey);
      res.json(ResponseUtil.success(segments, 'Road segments retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/map/roads/:roadKey/geojson - Lấy GeoJSON của một trục đường (hỗ trợ lọc theo tọa độ)
   */
  async getRoadGeoJson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { roadKey } = req.params;
      const { lat, lng } = req.query;

      logger.log(`GET /api/v1/map/roads/${roadKey}/geojson${lat ? `?lat=${lat}&lng=${lng}` : ''}`);

      const geojson = await mapService.getRoadGeoJson(
        roadKey,
        lat ? Number(lat) : undefined,
        lng ? Number(lng) : undefined
      );

      res.json(ResponseUtil.success(geojson, 'Road GeoJSON retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

}

export const mapController = new MapController();
