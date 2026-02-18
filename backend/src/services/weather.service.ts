// Weather Service - Query current weather impact data

import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';

const logger = new Logger('WeatherService');

type ImpactLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

interface WeatherRow {
  temp_c: number | string | null;
  condition_code: number | null;
  humidity: number | null;
  wind_kph: number | string | null;
  impact_level: ImpactLevel | string | null;
  warning_message: string | null;
  timestamp: Date | string | null;
}

export interface CurrentWeatherResponse {
  temp_c: number;
  condition_code: number;
  condition_text: string;
  humidity: number;
  wind_kph: number;
  impact_level: ImpactLevel;
  warning_message: string;
  last_updated: string;
}

export class WeatherService {
  async getCurrentWeather(): Promise<CurrentWeatherResponse | null> {
    try {
      logger.log('Fetching current weather impact from view');

      const rows = await prisma.$queryRaw<WeatherRow[]>`
        SELECT
          temp_c,
          condition_code,
          humidity,
          wind_kph,
          impact_level,
          warning_message,
          timestamp
        FROM view_current_weather_impact
        LIMIT 1
      `;

      const row = rows?.[0];
      if (!row || row.condition_code === null || row.temp_c === null) {
        return null;
      }

      const conditionCode = Number(row.condition_code);
      const tempC = Number(row.temp_c);
      const windKph = Number(row.wind_kph ?? 0);
      const humidity = Number(row.humidity ?? 0);
      const impactLevel = (row.impact_level || 'NONE') as ImpactLevel;
      const warningMessage = row.warning_message || '';
      const lastUpdated = row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString();

      return {
        temp_c: tempC,
        condition_code: conditionCode,
        condition_text: this.mapConditionText(conditionCode),
        humidity,
        wind_kph: windKph,
        impact_level: impactLevel,
        warning_message: warningMessage,
        last_updated: lastUpdated,
      };
    } catch (error) {
      logger.error('Error fetching current weather', error);
      throw error;
    }
  }

  private mapConditionText(conditionCode: number): string {
    if (conditionCode >= 200 && conditionCode <= 232) return 'Thunderstorm';
    if (conditionCode >= 300 && conditionCode <= 321) return 'Drizzle';
    if (conditionCode >= 500 && conditionCode <= 531) return 'Rain';
    if (conditionCode >= 600 && conditionCode <= 622) return 'Snow';
    if (conditionCode >= 701 && conditionCode <= 781) return 'Fog';
    if (conditionCode === 800) return 'Clear';
    if (conditionCode >= 801 && conditionCode <= 804) return 'Clouds';
    return 'Unknown';
  }
}

export const weatherService = new WeatherService();
