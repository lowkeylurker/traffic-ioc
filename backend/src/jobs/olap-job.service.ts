import { olapMartService } from '../services/olap-mart.service';
import { Logger } from '../utils/logger';

const logger = new Logger('OlapJobService');
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

class OlapJobService {
  private refreshTimer: NodeJS.Timeout | null = null;

  private isRunning = false;

  async start(): Promise<void> {
    const enabled = parseBoolean(process.env.OLAP_MART_DAILY_ENABLED, true);
    if (!enabled) {
      logger.log('OLAP refresh job is disabled by OLAP_MART_DAILY_ENABLED=false');
      return;
    }

    await this.runRefresh();

    this.refreshTimer = setInterval(() => {
      void this.runRefresh();
    }, REFRESH_INTERVAL_MS);

    logger.log('OLAP refresh cron started (every 15 minutes)');
  }

  private async runRefresh(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Skip OLAP refresh because previous run is still in progress');
      return;
    }

    this.isRunning = true;
    try {
      logger.log('Running scheduled OLAP materialized view refresh');
      await olapMartService.refreshMaterializedView();
      logger.log('Scheduled OLAP materialized view refresh completed');
    } catch (error) {
      logger.error('Scheduled OLAP materialized view refresh failed', error);
    } finally {
      this.isRunning = false;
    }
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

export const olapJobService = new OlapJobService();
