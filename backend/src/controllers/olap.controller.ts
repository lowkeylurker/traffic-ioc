import { NextFunction, Request, Response } from 'express';
import { olapMartService } from '../services/olap-mart.service';
import { ResponseUtil } from '../utils/response';

export class OlapController {
  async getHeatmap(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const district = req.query.district ? String(req.query.district) : undefined;
      const data = await olapMartService.getHeatmap(district);
      res.json(ResponseUtil.success(data, 'OLAP heatmap data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  async getCrossAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const district = req.query.district ? String(req.query.district) : undefined;
      const data = await olapMartService.getCrossAnalysis(district);
      res.json(ResponseUtil.success(data, 'OLAP cross-analysis data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  async getDrilldown(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roadName = String(req.query.roadName || '').trim();
      const district = req.query.district ? String(req.query.district) : undefined;

      if (roadName) {
        const points = await olapMartService.getSegmentDelayDrilldown(roadName, district);
        res.json(
          ResponseUtil.success(
            { level: 'segment', roadName, points },
            'OLAP segment drilldown data retrieved successfully'
          )
        );
        return;
      }

      const points = await olapMartService.getRoadDelayDrilldown(district);
      res.json(ResponseUtil.success({ level: 'road', points }, 'OLAP road drilldown data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const olapController = new OlapController();
