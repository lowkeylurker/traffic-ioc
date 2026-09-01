import { CorridorReliability } from '../models/corridor-reliability.model';
import { Logger } from '../utils/logger';

const logger = new Logger('CorridorReliabilityCacheService');

export class CorridorReliabilityCacheService {
  async getCache(timeWindow: string, sourcePeriod: string, corridorKey: string | null): Promise<any | null> {
    try {
      const record = await CorridorReliability.findOne({ timeWindow, sourcePeriod, corridorKey });
      return record ? record.data : null;
    } catch (error) {
      logger.error(`Lỗi khi lấy cache reliability cho ${timeWindow} - ${sourcePeriod} - ${corridorKey ?? 'TẤT CẢ'}`, error);
      return null;
    }
  }

  async setCache(timeWindow: string, sourcePeriod: string, corridorKey: string | null, periodStart: string, periodEnd: string, data: any[]): Promise<void> {
    try {
      await CorridorReliability.findOneAndUpdate(
        { timeWindow, sourcePeriod, corridorKey },
        { periodStart, periodEnd, data },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (error) {
      logger.error(`Lỗi khi lưu cache reliability cho ${timeWindow} - ${sourcePeriod} - ${corridorKey ?? 'TẤT CẢ'}`, error);
    }
  }

  async getMetadata(timeWindow: string, sourcePeriod: string, corridorKey: string | null): Promise<{ periodStart: string, periodEnd: string, updatedAt: Date } | null> {
    try {
      const record = await CorridorReliability.findOne({ timeWindow, sourcePeriod, corridorKey }, { periodStart: 1, periodEnd: 1, updatedAt: 1 });
      if (!record) return null;
      return {
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        updatedAt: record.updatedAt
      };
    } catch (error) {
      logger.error(`Lỗi khi lấy metadata reliability cho ${timeWindow} - ${sourcePeriod} - ${corridorKey ?? 'TẤT CẢ'}`, error);
      return null;
    }
  }

  async isCacheEmpty(): Promise<boolean> {
    try {
      const count = await CorridorReliability.countDocuments();
      return count === 0;
    } catch (error) {
      logger.error('Lỗi khi kiểm tra cache reliability trống', error);
      return false;
    }
  }
}

export const corridorReliabilityCacheService = new CorridorReliabilityCacheService();
