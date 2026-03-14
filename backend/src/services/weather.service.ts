import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';

const logger = new Logger('WeatherService');

export class WeatherService {
    /**
     * Get current weather data from SQL View vw_weather_impact
     */
    async getCurrentWeather() {
        try {
            const result: any[] = await prisma.$queryRaw`
        SELECT * FROM vw_weather_impact 
        ORDER BY timestamp DESC 
        LIMIT 1;
      `;

            if (result.length === 0) {
                return null;
            }

            return result[0];
        } catch (error) {
            logger.error('Error fetching current weather:', error);
            throw error;
        }
    }
}

export const weatherService = new WeatherService();
