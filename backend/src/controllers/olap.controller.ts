import { NextFunction, Request, Response } from 'express';
import { olapMartService } from '../services/olap-mart.service';
import { ResponseUtil } from '../utils/response';

export class OlapController {
  async getHeatmap(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const district = req.query.district ? String(req.query.district) : undefined;
      const period = req.query.period ? String(req.query.period) : undefined;
      const roadTypes = req.query.roadTypes
        ? Array.isArray(req.query.roadTypes)
          ? (req.query.roadTypes as string[])
          : [String(req.query.roadTypes)]
        : undefined;

      const data = await olapMartService.getHeatmap(district, period, roadTypes);
      res.json(ResponseUtil.success(data, 'OLAP heatmap data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  async getCrossAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const district = req.query.district ? String(req.query.district) : undefined;
      const period = req.query.period ? String(req.query.period) : undefined;
      const roadTypes = req.query.roadTypes
        ? Array.isArray(req.query.roadTypes)
          ? (req.query.roadTypes as string[])
          : [String(req.query.roadTypes)]
        : undefined;

      const data = await olapMartService.getCrossAnalysis(district, period, roadTypes);
      res.json(ResponseUtil.success(data, 'OLAP cross-analysis data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  async getDrilldown(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roadName = String(req.query.roadName || '').trim();
      const district = req.query.district ? String(req.query.district) : undefined;
      const period = req.query.period ? String(req.query.period) : undefined;
      const roadTypes = req.query.roadTypes
        ? Array.isArray(req.query.roadTypes)
          ? (req.query.roadTypes as string[])
          : [String(req.query.roadTypes)]
        : undefined;

      if (roadName) {
        const points = await olapMartService.getSegmentDelayDrilldown(roadName, district, period, roadTypes);
        res.json(
          ResponseUtil.success(
            { level: 'segment', roadName, points },
            'OLAP segment drilldown data retrieved successfully'
          )
        );
        return;
      }

      const points = await olapMartService.getRoadDelayDrilldown(district, period, roadTypes);
      res.json(ResponseUtil.success({ level: 'road', points }, 'OLAP road drilldown data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const district = req.query.district ? String(req.query.district) : undefined;
      const period = req.query.period ? String(req.query.period) : undefined;
      const roadTypes = req.query.roadTypes
        ? Array.isArray(req.query.roadTypes)
          ? (req.query.roadTypes as string[])
          : [String(req.query.roadTypes)]
        : undefined;

      const data = await olapMartService.getSummary(district, period, roadTypes);
      res.json(ResponseUtil.success(data, 'OLAP summary data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  async getDistrictRanking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const period = req.query.period ? String(req.query.period) : undefined;
      const roadTypes = req.query.roadTypes
        ? Array.isArray(req.query.roadTypes)
          ? (req.query.roadTypes as string[])
          : [String(req.query.roadTypes)]
        : undefined;

      const data = await olapMartService.getDistrictRanking(period, roadTypes);
      res.json(ResponseUtil.success(data, 'OLAP district ranking data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  async getRoadTypeComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const period = req.query.period ? String(req.query.period) : undefined;

      const data = await olapMartService.getRoadTypeComparison(period);
      res.json(ResponseUtil.success(data, 'OLAP road type comparison data retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const olapController = new OlapController();
