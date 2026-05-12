import { CorridorAnalytics } from '../models/corridor-analytics.model';
import { CorridorDashboardData } from '../interfaces';
import { Logger } from '../utils/logger';

const logger = new Logger('CorridorCacheService');

export class CorridorCacheService {
  async getCache(corridorKey: string | null, date: string): Promise<CorridorDashboardData | null> {
    try {
      const record = await CorridorAnalytics.findOne({ corridorKey, date });
      return record ? record.data : null;
    } catch (error) {
      logger.error(`Error getting cache for ${corridorKey} on ${date}`, error);
      return null;
    }
  }

  async setCache(corridorKey: string | null, date: string, data: CorridorDashboardData): Promise<void> {
    try {
      await CorridorAnalytics.findOneAndUpdate(
        { corridorKey, date },
        { data },
        { upsert: true, new: true }
      );
    } catch (error) {
      logger.error(`Error setting cache for ${corridorKey} on ${date}`, error);
    }
  }

  async getUpdatedAt(corridorKey: string | null, date: string): Promise<Date | null> {
    try {
      const record = await CorridorAnalytics.findOne({ corridorKey, date }, { updatedAt: 1 });
      return record ? record.updatedAt : null;
    } catch (error) {
      logger.error(`Error getting updatedAt for ${corridorKey} on ${date}`, error);
      return null;
    }
  }

  async isCollectionEmpty(): Promise<boolean> {
    try {
      const count = await CorridorAnalytics.countDocuments();
      return count === 0;
    } catch (error) {
      logger.error('Error checking if collection is empty', error);
      return false;
    }
  }
}

export const corridorCacheService = new CorridorCacheService();
