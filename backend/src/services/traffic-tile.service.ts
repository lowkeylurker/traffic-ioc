import { AppError } from '../middlewares/error.middleware';
import { Logger } from '../utils/logger';

const logger = new Logger('TrafficTileService');

const TOMTOM_TIMEOUT_MS = 12000;

export class TrafficTileService {
  async getFlowTile(z: string, x: string, y: string): Promise<Buffer> {
    const apiKey = process.env.TOMTOM_API_KEY;
    if (!apiKey) {
      throw new AppError(500, 'Thiếu TOMTOM_API_KEY trong môi trường', 'TOMTOM_KEY_MISSING');
    }

    const cleanY = y.endsWith('.pbf') ? y.slice(0, -4) : y;

    const zoom = Number(z);
    const tileX = Number(x);
    const tileY = Number(cleanY);

    if (!Number.isInteger(zoom) || !Number.isInteger(tileX) || !Number.isInteger(tileY)) {
      throw new AppError(400, 'Tham số tile không hợp lệ', 'BAD_TILE_COORDS');
    }

    const tomtomUrl = `https://api.tomtom.com/traffic/map/4/tile/flow/relative/${zoom}/${tileX}/${tileY}.pbf?key=${apiKey}`;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TOMTOM_TIMEOUT_MS);

    try {
      const response = await fetch(tomtomUrl, {
        method: 'GET',
        signal: abortController.signal,
      });

      if (!response.ok) {
        const bodyPreview = await response.text();
        logger.warn('TomTom tile request failed', {
          status: response.status,
          statusText: response.statusText,
          tile: `${zoom}/${tileX}/${tileY}`,
          bodyPreview: bodyPreview.slice(0, 300),
        });

        throw new AppError(
          response.status === 401 || response.status === 403 ? 502 : 504,
          'Không thể lấy tile giao thông từ TomTom',
          'TOMTOM_PROXY_ERROR'
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new AppError(504, 'TomTom timeout khi lấy tile', 'TOMTOM_TIMEOUT');
      }

      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Lỗi proxy tile TomTom', error);
      throw new AppError(502, 'Lỗi kết nối TomTom tile service', 'TOMTOM_CONNECT_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const trafficTileService = new TrafficTileService();
