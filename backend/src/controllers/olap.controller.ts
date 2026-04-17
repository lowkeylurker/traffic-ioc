import { NextFunction, Request, Response } from 'express';
import { AppError } from '../middlewares/error.middleware';
import { olapMartService } from '../services/olap-mart.service';
import { ResponseUtil } from '../utils/response';

type AnalyzeType = 'heatmap' | 'scatter' | 'drilldown';
type DrillLevel = 'year' | 'month';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const parseNumber = (input: unknown, fallback: number): number => {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
};

const toMonthValue = (year: number, month: number): string => {
  return `${year}-${String(month).padStart(2, '0')}`;
};

export class OlapController {
  async getDistricts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const districts = await olapMartService.getDistrictOptions();
      res.json(ResponseUtil.success(districts, 'OLAP district options retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/olap/analyze
   * Mock endpoint cho truy vấn OLAP đa chiều (heatmap, scatter, drilldown).
   */
  async analyze(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const type = String(req.query.type || '').toLowerCase() as AnalyzeType;
      const filter = olapMartService.normalizeFilter({
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        districts: typeof req.query.districts === 'string' ? req.query.districts : undefined,
        weatherImpactMin: typeof req.query.weatherImpactMin === 'string' ? req.query.weatherImpactMin : undefined,
        weatherImpactMax: typeof req.query.weatherImpactMax === 'string' ? req.query.weatherImpactMax : undefined,
        rainfallMin: typeof req.query.rainfallMin === 'string' ? req.query.rainfallMin : undefined,
        rainfallMax: typeof req.query.rainfallMax === 'string' ? req.query.rainfallMax : undefined,
      });

      if (type === 'heatmap') {
        const data = await olapMartService.getHeatmap(filter);

        res.json(ResponseUtil.success(data, 'OLAP heatmap data generated successfully'));
        return;
      }

      if (type === 'scatter') {
        const data = await olapMartService.getScatter(filter);

        res.json(ResponseUtil.success(data, 'OLAP scatter data generated successfully'));
        return;
      }

      if (type === 'drilldown') {
        const level = String(req.query.level || '').toLowerCase() as DrillLevel;
        const value = String(req.query.value || '').trim();

        if (level !== 'year' && level !== 'month') {
          throw new AppError(400, 'Invalid drilldown level. Use year or month.', 'BAD_REQUEST');
        }

        if (!value) {
          throw new AppError(400, 'Missing drilldown value.', 'BAD_REQUEST');
        }

        if (level === 'year') {
          const year = clamp(parseNumber(value, new Date().getFullYear()), 2000, 2100);
          const points = await olapMartService.getDrilldownYear(filter, year);

          res.json(
            ResponseUtil.success(
              {
                level: 'year',
                value: String(year),
                points,
              },
              'OLAP drilldown year data generated successfully'
            )
          );
          return;
        }

        const monthMatch = value.match(/^(\d{4})-(\d{1,2})$/);
        const currentYear = new Date().getFullYear();
        const year = monthMatch ? Number(monthMatch[1]) : currentYear;
        const month = clamp(monthMatch ? Number(monthMatch[2]) : parseNumber(value, 1), 1, 12);
        const safeYear = clamp(year, 2000, 2100);
        const points = await olapMartService.getDrilldownMonth(filter, safeYear, month);

        res.json(
          ResponseUtil.success(
            {
              level: 'month',
              value: toMonthValue(safeYear, month),
              points,
            },
            'OLAP drilldown month data generated successfully'
          )
        );
        return;
      }

      throw new AppError(400, 'Invalid type. Use heatmap, scatter or drilldown.', 'BAD_REQUEST');
    } catch (error) {
      next(error);
    }
  }
}

export const olapController = new OlapController();
