import { NextFunction, Request, Response } from 'express';
import { trafficTileService } from '../services/traffic-tile.service';
import { Logger } from '../utils/logger';

const logger = new Logger('TrafficController');

export class TrafficController {
  async getSegmentDetail(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Tham số lat/lng không hợp lệ' });
      return;
    }

    const result = await trafficTileService.getSegmentDetail(lat, lng);

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  }

  async getFlowTile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { z, x, y } = req.params;
      logger.log(`GET /traffic/tiles/${z}/${x}/${y}.pbf`);

      const tileBuffer = await trafficTileService.getFlowTile(z, x, y);

      res.setHeader('Content-Type', 'application/x-protobuf');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).send(tileBuffer);
    } catch (error) {
      next(error);
    }
  }
}

export const trafficController = new TrafficController();
