// Weather Service - Query current weather impact data

import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';

const logger = new Logger('WeatherService');

type ImpactLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

interface WarehouseWeatherRow {
  weather_id: number | null;
  main_category: string | null;
  severity_level: number | null;
  timestamp: Date | string | null;
}

export interface CurrentWeatherResponse {
  temp_c: number | null;
  condition_code: number;
  condition_text: string;
  humidity: number | null;
  wind_kph: number | null;
  impact_level: ImpactLevel;
  warning_message: string;
  last_updated: string;
}

export class WeatherService {
  async getCurrentWeather(): Promise<CurrentWeatherResponse | null> {
    try {
      logger.log('Fetching current weather from fact_traffic_flow + dim_weather');

      const warehouseRows = await prisma.$queryRaw<WarehouseWeatherRow[]>`
        WITH latest_minute AS (
          SELECT DATE_TRUNC('minute', MAX(timestamp)) AS minute_ts
          FROM fact_traffic_flow
          WHERE timestamp IS NOT NULL
        ),
        dominant_weather AS (
          SELECT
            ftf.weather_key,
            MAX(ftf.timestamp) AS latest_timestamp,
            COUNT(*) AS sample_count,
            SUM(COALESCE(ftf.pcu_volume, 0)) AS weighted_volume
          FROM fact_traffic_flow ftf
          INNER JOIN latest_minute lm
            ON DATE_TRUNC('minute', ftf.timestamp) = lm.minute_ts
          WHERE ftf.weather_key IS NOT NULL
          GROUP BY ftf.weather_key
          ORDER BY weighted_volume DESC, sample_count DESC, ftf.weather_key ASC
          LIMIT 1
        )
        SELECT
          dw.weather_id,
          dw.main_category,
          dw.severity_level,
          d.latest_timestamp AS timestamp
        FROM dominant_weather d
        INNER JOIN dim_weather dw ON dw.weather_key = d.weather_key
        LIMIT 1
      `;

      const warehouseRow = warehouseRows?.[0];
      if (!warehouseRow) {
        return null;
      }

      const derivedConditionCode =
        warehouseRow.weather_id ?? this.mapCategoryToConditionCode(warehouseRow.main_category);
      const conditionCode = Number(derivedConditionCode);
      const conditionText = warehouseRow.main_category || this.mapConditionText(conditionCode);

      const tempC: number | null = null;
      const windKph: number | null = null;
      const humidity: number | null = null;

      const impactLevel = this.mapSeverityToImpactLevel(warehouseRow.severity_level);
      const warningMessage = this.buildWarningMessage(impactLevel, conditionText);

      const sourceTimestamp = warehouseRow.timestamp;
      const lastUpdated = sourceTimestamp ? new Date(sourceTimestamp).toISOString() : new Date().toISOString();

      if (Number.isNaN(conditionCode)) {
        return null;
      }

      return {
        temp_c: tempC,
        condition_code: conditionCode,
        condition_text: conditionText,
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

  private mapSeverityToImpactLevel(severityLevel: number | null): ImpactLevel {
    if (severityLevel === null || severityLevel <= 0) return 'NONE';
    if (severityLevel <= 1) return 'LOW';
    if (severityLevel <= 2) return 'MEDIUM';
    return 'HIGH';
  }

  private mapCategoryToConditionCode(mainCategory: string | null): number {
    const category = (mainCategory || '').toLowerCase();
    if (category.includes('thunder')) return 210;
    if (category.includes('drizzle')) return 310;
    if (category.includes('rain')) return 500;
    if (category.includes('snow')) return 600;
    if (category.includes('fog') || category.includes('mist') || category.includes('haze')) return 741;
    if (category.includes('cloud')) return 803;
    if (category.includes('clear') || category.includes('sun')) return 800;
    return 800;
  }

  private buildWarningMessage(impactLevel: ImpactLevel, conditionText: string): string {
    if (impactLevel === 'HIGH') {
      return `Thoi tiet ${conditionText.toLowerCase()}, anh huong cao den giao thong.`;
    }
    if (impactLevel === 'MEDIUM') {
      return `Thoi tiet ${conditionText.toLowerCase()}, can theo doi.`;
    }
    if (impactLevel === 'LOW') {
      return `Thoi tiet ${conditionText.toLowerCase()}, anh huong nhe.`;
    }
    return '';
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
