import { AppError } from '../middlewares/error.middleware';
import { Logger } from '../utils/logger';

const logger = new Logger('TrafficTileService');

const TOMTOM_TIMEOUT_MS = 12000;

export interface TrafficSegmentDetailSuccess {
  currentSpeed: number;
  freeFlowSpeed: number;
  trafficIndex: string;
}

export interface TrafficSegmentDetailError {
  error: string;
  status: number;
}

export class TrafficTileService {
  private parseTileCoords(z: string, x: string, y: string): { zoom: number; tileX: number; tileY: number } {
    const cleanY = y.endsWith('.pbf') ? y.slice(0, -4) : y;

    const zoom = Number(z);
    const tileX = Number(x);
    const tileY = Number(cleanY);

    if (!Number.isInteger(zoom) || !Number.isInteger(tileX) || !Number.isInteger(tileY)) {
      throw new AppError(400, 'Tham số tile không hợp lệ', 'BAD_TILE_COORDS');
    }

    return { zoom, tileX, tileY };
  }

  async getSegmentDetail(lat: number, lng: number): Promise<TrafficSegmentDetailSuccess | TrafficSegmentDetailError> {
    const apiKey = process.env.TOMTOM_API_KEY;
    if (!apiKey) {
      return {
        error: 'Thiếu TOMTOM_API_KEY trong môi trường',
        status: 500,
      };
    }

    const tomtomUrl =
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
      `?point=${lat},${lng}&unit=KMPH&key=${apiKey}`;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TOMTOM_TIMEOUT_MS);

    try {
      const response = await fetch(tomtomUrl, {
        method: 'GET',
        signal: abortController.signal,
      });

      if (!response.ok) {
        logger.warn('TomTom flow segment detail request failed', {
          status: response.status,
          statusText: response.statusText,
          lat,
          lng,
        });

        return {
          error:
            response.status === 404
              ? 'Không tìm thấy dữ liệu cho đoạn đường này'
              : 'Không thể lấy thông tin tốc độ từ TomTom',
          status: response.status === 404 ? 404 : 502,
        };
      }

      const payload = (await response.json()) as {
        flowSegmentData?: {
          currentSpeed?: number;
          freeFlowSpeed?: number;
        };
      };
      const flowSegmentData = payload?.flowSegmentData;

      const currentSpeed = Number(flowSegmentData?.currentSpeed);
      const freeFlowSpeed = Number(flowSegmentData?.freeFlowSpeed);

      if (!Number.isFinite(currentSpeed) || !Number.isFinite(freeFlowSpeed) || freeFlowSpeed <= 0) {
        return {
          error: 'Không có dữ liệu tốc độ thực tế cho đoạn đường này',
          status: 404,
        };
      }

      const trafficIndex = (currentSpeed / freeFlowSpeed).toFixed(2);

      return {
        currentSpeed,
        freeFlowSpeed,
        trafficIndex,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return {
          error: 'TomTom phản hồi quá lâu, vui lòng thử lại',
          status: 504,
        };
      }

      logger.error('Lỗi proxy TomTom flow segment detail', error);
      return {
        error: 'Không thể kết nối đến TomTom',
        status: 502,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getFlowTile(z: string, x: string, y: string): Promise<Buffer> {
    const apiKey = process.env.TOMTOM_API_KEY;
    if (!apiKey) {
      throw new AppError(500, 'Thiếu TOMTOM_API_KEY trong môi trường', 'TOMTOM_KEY_MISSING');
    }

    const { zoom, tileX, tileY } = this.parseTileCoords(z, x, y);

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

  async getIncidentTile(z: string, x: string, y: string): Promise<Buffer> {
    const apiKey = process.env.TOMTOM_API_KEY;
    if (!apiKey) {
      throw new AppError(500, 'Thiếu TOMTOM_API_KEY trong môi trường', 'TOMTOM_KEY_MISSING');
    }

    const { zoom, tileX, tileY } = this.parseTileCoords(z, x, y);

    const tomtomUrl = `https://api.tomtom.com/traffic/map/4/tile/incidents/${zoom}/${tileX}/${tileY}.pbf?key=${apiKey}`;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TOMTOM_TIMEOUT_MS);

    try {
      const response = await fetch(tomtomUrl, {
        method: 'GET',
        signal: abortController.signal,
      });

      if (!response.ok) {
        const bodyPreview = await response.text();

        logger.warn('TomTom incident tile request failed', {
          status: response.status,
          statusText: response.statusText,
          tile: `${zoom}/${tileX}/${tileY}`,
          bodyPreview: bodyPreview.slice(0, 300),
        });

        if (response.status === 401 || response.status === 403) {
          throw new AppError(502, 'Không thể lấy incident tile từ TomTom', 'TOMTOM_PROXY_ERROR');
        }

        if (response.status === 404) {
          throw new AppError(404, 'Incident tile không tồn tại cho tile này', 'TOMTOM_TILE_NOT_FOUND');
        }

        throw new AppError(502, 'Lỗi phản hồi từ TomTom incident tile service', 'TOMTOM_PROXY_ERROR');
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new AppError(504, 'TomTom timeout khi lấy incident tile', 'TOMTOM_TIMEOUT');
      }

      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Lỗi proxy incident tile TomTom', error);
      throw new AppError(502, 'Lỗi kết nối TomTom incident tile service', 'TOMTOM_CONNECT_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const trafficTileService = new TrafficTileService();
