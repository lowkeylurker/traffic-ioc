import { Request, Response } from 'express';
import { getRedisConnection } from '../config/redis';
import { HTTP_STATUS, RESPONSE_MESSAGES } from '../constants/messages';
import { Logger } from '../utils/logger';

const logger = new Logger('NewsController');

export class NewsController {
  /**
   * Lấy tin tức giao thông mới nhất từ Redis
   */
  public async getLatestNews(req: Request, res: Response): Promise<void> {
    try {
      const redis = getRedisConnection();
      const news = await redis.get('latest_traffic_news');

      if (!news) {
        res.status(HTTP_STATUS.OK).json({
          success: true,
          data: {
            news: '📡 Hệ thống đang cập nhật thông tin giao thông...',
          },
        });
        return;
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { news },
      });
    } catch (error) {
      logger.error('Error fetching latest news', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: RESPONSE_MESSAGES.INTERNAL_ERROR,
      });
    }
  }
}

export const newsController = new NewsController();
