import { describe, it, expect, beforeEach, vi } from 'vitest';
import { corridorAnalyticsJobService } from '../jobs/corridor-analytics-job.service';
import { analyticsService } from '../services/analytics.service';
import { corridorCacheService } from '../services/corridor-cache.service';

describe('CorridorAnalyticsJobService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('refreshCorridorsForDate', () => {
    it('should process all corridors and return success and failure summary counts', async () => {
      // Mock corridor options (2 corridors -> 3 keys including null for ALL)
      vi.spyOn(analyticsService, 'getCorridorOptions').mockResolvedValueOnce([
        { corridorKey: '101', corridorName: 'Corridor 101', importanceLevel: 1, targetAvgSpeed: 40 },
        { corridorKey: '102', corridorName: 'Corridor 102', importanceLevel: 2, targetAvgSpeed: 35 },
      ] as any);

      vi.spyOn(analyticsService, 'computeCorridorDashboard').mockResolvedValue({
        summary: { totalCorridors: 2, avgSpeed: 35.5, totalDelayHours: 120, avgTti: 1.2 },
        hourlyMetrics: [],
        topCongestedCorridors: [],
      } as any);

      vi.spyOn(corridorCacheService, 'setCache').mockResolvedValue();

      const result = await corridorAnalyticsJobService.refreshCorridorsForDate('2026-09-01');

      expect(result.success).toBe(3); // null (ALL), '101', '102'
      expect(result.failed).toBe(0);
      expect(analyticsService.computeCorridorDashboard).toHaveBeenCalledTimes(3);
      expect(corridorCacheService.setCache).toHaveBeenCalledTimes(3);
    });

    it('should continue processing remaining corridors and increment failed count when one corridor throws error', async () => {
      vi.spyOn(analyticsService, 'getCorridorOptions').mockResolvedValueOnce([
        { corridorKey: '101', corridorName: 'Corridor 101', importanceLevel: 1, targetAvgSpeed: 40 },
        { corridorKey: '102', corridorName: 'Corridor 102', importanceLevel: 2, targetAvgSpeed: 35 },
      ] as any);

      vi.spyOn(analyticsService, 'computeCorridorDashboard')
        .mockResolvedValueOnce({ summary: {} } as any) // null
        .mockRejectedValueOnce(new Error('DB Timeout')) // 101 fails
        .mockResolvedValueOnce({ summary: {} } as any); // 102 succeeds

      vi.spyOn(corridorCacheService, 'setCache').mockResolvedValue();

      const result = await corridorAnalyticsJobService.refreshCorridorsForDate('2026-09-01');

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
    });
  });
});
