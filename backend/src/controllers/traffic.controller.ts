import { NextFunction, Request, Response } from 'express';
import { trafficTileService } from '../services/traffic-tile.service';
import { Logger } from '../utils/logger';

const logger = new Logger('TrafficController');

export class TrafficController {
  async getFlowTile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { z, x, y } = req.params;
      logger.log(`GET /api/traffic/tiles/${z}/${x}/${y}.pbf`);

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
