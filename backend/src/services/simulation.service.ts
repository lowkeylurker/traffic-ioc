// Simulation Service - Xử lý logic dự báo & routing

import { Logger } from '../utils/logger';
import { ForecastRequest, ForecastResponse, RoutingRequest, RoutingResponse } from '../interfaces/index';

const logger = new Logger('SimulationService');

export class SimulationService {
  /**
   * Dự báo tốc độ cho một đoạn đường trong tương lai
   * Hiện tại: Mock data - sẽ được thay bằng AI model call
   */
  async forecast(request: ForecastRequest): Promise<ForecastResponse> {
    try {
      logger.log(`Forecasting for segment ${request.segmentId}`, request);

      // TODO: Gọi AI model service để dự báo
      // Tạm thời trả mock data
      const mockForecast: ForecastResponse = {
        segmentId: request.segmentId,
        predictedSpeed: 35 + Math.random() * 15, // Random 35-50 km/h
        predictedLos: this.getRandomLos(),
        confidenceScore: 75 + Math.random() * 20, // 75-95%
        forecastTime: new Date(Date.now() + (request.horizonMinutes || 60) * 60000),
      };

      logger.log(`Forecast generated for segment ${request.segmentId}`, mockForecast);
      return mockForecast;
    } catch (error) {
      logger.error('Error generating forecast', error);
      throw error;
    }
  }

  /**
   * Tìm lộ trình thay thế tránh các đoạn đường bị chặn
   * Hiện tại: Mock data - sẽ được thay bằng pgRouting
   */
  async routing(request: RoutingRequest): Promise<RoutingResponse> {
    try {
      logger.log('Computing alternative route', request);

      // TODO: Gọi pgRouting function để tìm đường
      // Tạm thời trả mock data
      const mockRoute: RoutingResponse = {
        route: {
          type: 'LineString',
          coordinates: [
            request.startPoint,
            [(request.startPoint[0] + request.endPoint[0]) / 2, (request.startPoint[1] + request.endPoint[1]) / 2],
            request.endPoint,
          ],
        },
        totalDistance: this.calculateDistance(request.startPoint, request.endPoint),
        estimatedTime: 25 + Math.random() * 15, // Random 25-40 phút
      };

      logger.log(`Route computed: ${mockRoute.totalDistance.toFixed(2)} km`, mockRoute);
      return mockRoute;
    } catch (error) {
      logger.error('Error computing route', error);
      throw error;
    }
  }

  /**
   * Helper: Tính khoảng cách giữa 2 điểm (đơn vị km)
   * Sử dụng Haversine formula
   */
  private calculateDistance(start: [number, number], end: [number, number]): number {
    const R = 6371; // Bán kính Trái đất (km)
    const dLat = this.toRad(end[1] - start[1]);
    const dLon = this.toRad(end[0] - start[0]);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(start[1])) *
        Math.cos(this.toRad(end[1])) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Helper: Chuyển độ sang radian
   */
  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Helper: Trả về LOS random (A-F)
   */
  private getRandomLos(): string {
    const losGrades = ['A', 'B', 'C', 'D', 'E', 'F'];
    return losGrades[Math.floor(Math.random() * losGrades.length)];
  }
}

export const simulationService = new SimulationService();
