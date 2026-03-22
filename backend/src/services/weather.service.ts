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

export interface WeatherSegmentFeature {
  type: 'Feature';
  geometry: any;
  properties: {
    segmentId: string;
    segmentName: string;
    weatherId: number | null;
    weatherCategory: string | null;
    severityLevel: number | null;
    weatherColor: string;
    timestamp: string | null;
  };
}

export interface WeatherSegmentResponse {
  type: 'FeatureCollection';
  features: WeatherSegmentFeature[];
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

  async getWeatherSegments(): Promise<WeatherSegmentResponse> {
    try {
      logger.log('Fetching segments with weather data');

      const rows = await prisma.$queryRaw<any[]>`
        WITH latest_flow AS (
          SELECT DISTINCT ON (segment_key)
            segment_key,
            weather_key,
            timestamp
          FROM fact_traffic_flow
          WHERE timestamp IS NOT NULL
          ORDER BY segment_key, timestamp DESC
        )
        SELECT
          s.segment_key::text as "segmentId",
          s.segment_id_source::text as "segmentName",
          ST_AsGeoJSON(s.geometry_linestring)::json as geometry,
          dw.weather_id as "weatherId",
          dw.main_category as "weatherCategory",
          dw.severity_level as "severityLevel",
          lf.timestamp as "timestamp"
        FROM dim_segment s
        LEFT JOIN latest_flow lf ON lf.segment_key = s.segment_key
        LEFT JOIN dim_weather dw ON dw.weather_key = lf.weather_key
        ORDER BY s.segment_key
      `;

      const features: WeatherSegmentFeature[] = rows.map((row) => {
        const weatherColor = this.getWeatherColor(row.weatherId || row.weatherCategory);
        return {
          type: 'Feature',
          geometry: row.geometry,
          properties: {
            segmentId: row.segmentId,
            segmentName: row.segmentName,
            weatherId: row.weatherId,
            weatherCategory: row.weatherCategory,
            severityLevel: row.severityLevel,
            weatherColor,
            timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
          },
        };
      });

      return {
        type: 'FeatureCollection',
        features,
      };
    } catch (error) {
      logger.error('Error fetching weather segments', error);
      throw error;
    }
  }

  private getWeatherColor(weatherIdOrCategory: number | string | null): string {
    if (!weatherIdOrCategory) return '#9CA3AF'; // Gray - unknown

    // If it's a weather ID (number), use it
    const weatherId = typeof weatherIdOrCategory === 'number' ? weatherIdOrCategory : null;
    const category = typeof weatherIdOrCategory === 'string' ? weatherIdOrCategory.toLowerCase() : '';

    if (weatherId) {
      if (weatherId >= 200 && weatherId <= 232) return '#7C3AED'; // Purple - Thunderstorm
      if (weatherId >= 300 && weatherId <= 321) return '#3B82F6'; // Blue - Drizzle
      if (weatherId >= 500 && weatherId <= 531) return '#0EA5E9'; // Cyan - Rain
      if (weatherId >= 600 && weatherId <= 622) return '#E0F2FE'; // Light blue - Snow
      if (weatherId >= 701 && weatherId <= 781) return '#A78BFA'; // Light purple - Fog
      if (weatherId === 800) return '#FBBF24'; // Amber - Clear
      if (weatherId >= 801 && weatherId <= 804) return '#D1D5DB'; // Gray - Cloudy
    }

    // Fallback to category matching
    if (category.includes('thunder')) return '#7C3AED';
    if (category.includes('drizzle')) return '#3B82F6';
    if (category.includes('rain')) return '#0EA5E9';
    if (category.includes('snow')) return '#E0F2FE';
    if (category.includes('fog') || category.includes('mist') || category.includes('haze')) return '#A78BFA';
    if (category.includes('clear') || category.includes('sunny')) return '#FBBF24';
    if (category.includes('cloud')) return '#D1D5DB';

    return '#9CA3AF';
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
