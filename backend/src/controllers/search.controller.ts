import { NextFunction, Request, Response } from 'express';
import { searchService } from '../services/search.service';

export class SearchController {
  async searchPlaces(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawQuery = String(req.query.q || '').trim();

      if (!rawQuery) {
        res.status(400).json({ error: 'Thiếu từ khóa tìm kiếm q' });
        return;
      }

      const places = await searchService.searchPlaces(rawQuery);
      res.json(places);
    } catch (error) {
      next(error);
    }
  }
}

export const searchController = new SearchController();
