import { NextFunction, Request, Response } from 'express';
import { SmartDepartureSchema } from '../dtos/index';
import { smartDepartureService } from '../services/smart-departure.service';
import { ResponseUtil } from '../utils/response';

export class SmartDepartureController {
  async getSuggestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = SmartDepartureSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json(ResponseUtil.badRequest('Invalid smart departure payload', parsed.error.flatten()));
        return;
      }

      const result = await smartDepartureService.getSuggestions(parsed.data);
      res.status(200).json(ResponseUtil.success(result, 'Smart departure suggestions computed'));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('SMART_DEPARTURE_DATA:')) {
        res.status(400).json(ResponseUtil.badRequest(error.message.replace('SMART_DEPARTURE_DATA: ', '')));
        return;
      }

      next(error);
    }
  }
}

export const smartDepartureController = new SmartDepartureController();
