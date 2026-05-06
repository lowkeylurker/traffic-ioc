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

interface WeatherVoronoiRow {
  cell_id: string;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  weather_key: number | null;
  weather_id: number | null;
  weather_name: string | null;
  weather_category: string | null;
  severity_level: number | null;
  segment_count: number;
  latest_timestamp: Date | string | null;
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

export interface WeatherVoronoiFeature {
  type: 'Feature';
  geometry: WeatherVoronoiRow['geometry'];
  properties: {
    cell_id: string;
    weather_key: number | null;
    weather_id: number | null;
    weather_name: string | null;
    weather_category: string | null;
    severity_level: number | null;
    weather_color: string;
    segment_count: number;
    latest_timestamp: string | null;
  };
}

export interface WeatherVoronoiResponse {
  type: 'FeatureCollection';
  features: WeatherVoronoiFeature[];
  metadata: {
    total_polygons: number;
    generated_at: string;
  };
}

export class WeatherService {
  async getCurrentWeather(): Promise<CurrentWeatherResponse | null> {
    try {
      logger.log('Fetching current weather from fact_traffic_flow + dim_weather');

      const warehouseRows = await prisma.$queryRaw<WarehouseWeatherRow[]>`
        WITH latest_minute AS (
          SELECT DATE_TRUNC('minute', MAX(inserted_at)) AS minute_ts
          FROM fact_traffic_flow
          WHERE inserted_at IS NOT NULL
        ),
        dominant_weather AS (
          SELECT
            ftf.weather_key,
            MAX(ftf.inserted_at) AS latest_timestamp,
            COUNT(*) AS sample_count,
            SUM(COALESCE(ftf.pcu_volume, 0)) AS weighted_volume
          FROM fact_traffic_flow ftf
          INNER JOIN latest_minute lm
            ON DATE_TRUNC('minute', ftf.inserted_at) = lm.minute_ts
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
            inserted_at
          FROM fact_traffic_flow
          WHERE inserted_at >= NOW() - INTERVAL '15 minutes'
            AND inserted_at::date = CURRENT_DATE
          ORDER BY segment_key, inserted_at DESC
        )
        SELECT
          s.segment_key::text as "segmentId",
          COALESCE(r.name, s.segment_id_source::text) as "segmentName",
          ST_AsGeoJSON(s.geometry_linestring)::json as geometry,
          dw.weather_id as "weatherId",
          dw.main_category as "weatherCategory",
          dw.severity_level as "severityLevel",
          lf.inserted_at as "timestamp"
        FROM dim_segment s
        LEFT JOIN dim_way w ON w.way_key = s.way_key
        LEFT JOIN dim_road r ON r.road_key = w.road_key
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

  async getWeatherVoronoiPolygons(): Promise<WeatherVoronoiResponse> {
    try {
      logger.log('Fetching weather Voronoi polygons via ST_VoronoiPolygons');

      const rows = await prisma.$queryRaw<WeatherVoronoiRow[]>`
        WITH latest_flow AS (
          SELECT DISTINCT ON (ftf.segment_key)
            ftf.segment_key,
            ftf.weather_key,
            ftf.inserted_at
          FROM fact_traffic_flow ftf
          WHERE ftf.inserted_at >= NOW() - INTERVAL '15 minutes'
            AND ftf.weather_key IS NOT NULL
          ORDER BY ftf.segment_key, ftf.inserted_at DESC
        ),
        segment_weather AS (
          SELECT
            CASE
              WHEN ST_SRID(ds.geometry_center) = 0
                THEN ST_SetSRID(ds.geometry_center, 4326)
              WHEN ST_SRID(ds.geometry_center) != 4326
                THEN ST_Transform(ds.geometry_center, 4326)
              ELSE ds.geometry_center
            END AS point_geom,
            dw.weather_key,
            dw.weather_id,
            dw.name AS weather_name,
            dw.main_category AS weather_category,
            dw.severity_level,
            lf.inserted_at
          FROM latest_flow lf
          INNER JOIN dim_segment ds ON ds.segment_key = lf.segment_key
          INNER JOIN dim_weather dw ON dw.weather_key = lf.weather_key
          WHERE ds.geometry_center IS NOT NULL
        ),
        voronoi_cells AS (
          SELECT
            ROW_NUMBER() OVER ()::text AS cell_id,
            dump.geom AS cell_geom
          FROM (
            SELECT
              ST_Dump(
                ST_VoronoiPolygons(
                  ST_Collect(sw.point_geom),
                  0.0,
                  ST_Envelope(ST_Collect(sw.point_geom))
                )
              ) AS dump_item
            FROM segment_weather sw
          ) v
          CROSS JOIN LATERAL (SELECT (v.dump_item).geom AS geom) dump
        ),
        points_in_cells AS (
          SELECT
            vc.cell_id,
            vc.cell_geom,
            sw.weather_key,
            sw.weather_id,
            sw.weather_name,
            sw.weather_category,
            sw.severity_level,
            sw.inserted_at,
            ROW_NUMBER() OVER (
              PARTITION BY vc.cell_id
              ORDER BY sw.severity_level ASC NULLS LAST, sw.inserted_at DESC
            ) AS rn,
            COUNT(*) OVER (PARTITION BY vc.cell_id)::int AS segment_count,
            MAX(sw.inserted_at) OVER (PARTITION BY vc.cell_id) AS latest_timestamp
          FROM voronoi_cells vc
          INNER JOIN segment_weather sw
            ON ST_Intersects(vc.cell_geom, sw.point_geom)
        )
        SELECT
          pic.cell_id,
          ST_AsGeoJSON(pic.cell_geom)::json AS geometry,
          pic.weather_key,
          pic.weather_id,
          pic.weather_name,
          pic.weather_category,
          pic.severity_level,
          pic.segment_count,
          pic.latest_timestamp
        FROM points_in_cells pic
        WHERE pic.rn = 1
        ORDER BY pic.severity_level ASC NULLS LAST, pic.cell_id
      `;

      const features: WeatherVoronoiFeature[] = rows.map((row) => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          cell_id: row.cell_id,
          weather_key: row.weather_key,
          weather_id: row.weather_id,
          weather_name: row.weather_name,
          weather_category: row.weather_category,
          severity_level: row.severity_level,
          weather_color: this.getWeatherColorByType(row.weather_id, row.weather_category),
          segment_count: row.segment_count,
          latest_timestamp: row.latest_timestamp ? new Date(row.latest_timestamp).toISOString() : null,
        },
      }));

      return {
        type: 'FeatureCollection',
        features,
        metadata: {
          total_polygons: features.length,
          generated_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Error fetching weather Voronoi polygons', error);
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
      if (weatherId === 800) return 'rgba(0,0,0,0)'; // Transparent - Clear
      if (weatherId === 801) return '#64748B'; // Slate - Few clouds
      if (weatherId === 802) return '#475569'; // Darker slate - Scattered clouds
      if (weatherId === 803) return '#334155'; // Deep slate - Broken clouds
      if (weatherId === 804) return '#1E293B'; // Very dark slate - Overcast clouds
    }

    // Fallback to category matching
    if (category.includes('thunder')) return '#7C3AED';
    if (category.includes('drizzle')) return '#3B82F6';
    if (category.includes('rain')) return '#0EA5E9';
    if (category.includes('snow')) return '#E0F2FE';
    if (category.includes('fog') || category.includes('mist') || category.includes('haze')) return '#A78BFA';
    if (category.includes('clear') || category.includes('sunny')) return 'rgba(0,0,0,0)';
    if (category.includes('cloud')) return '#475569';

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

  private getWeatherColorBySeverity(severityLevel: number | null): string {
    if (severityLevel === null) return '#9CA3AF';
    if (severityLevel <= 1) return '#FF0000';
    if (severityLevel <= 2) return '#FF6600';
    if (severityLevel <= 3) return '#FFCC00';
    if (severityLevel <= 4) return '#00CC00';
    return '#0088FF';
  }

  /**
   * Fixed color mapping by weather type from dim_weather catalog (24 weather IDs).
   * This keeps Voronoi polygons stable and visually distinct per weather type.
   */
  private getWeatherColorByType(weatherId: number | null, weatherCategory: string | null): string {
    const colorByWeatherId: Record<number, string> = {
      // Thunderstorm
      200: '#7C3AED',
      201: '#6D28D9',
      202: '#5B21B6',
      211: '#8B5CF6',
      212: '#4C1D95',

      // Drizzle
      300: '#38BDF8',
      301: '#0EA5E9',
      310: '#0284C7',

      // Rain
      500: '#60A5FA',
      501: '#3B82F6',
      502: '#2563EB',
      503: '#1D4ED8',
      504: '#1E40AF',
      520: '#22D3EE',
      521: '#06B6D4',

      // Mist / Haze / Fog
      701: '#9CA3AF',
      721: '#A8A29E',
      741: '#6B7280',

      // Clear / Clouds
      800: 'rgba(0,0,0,0)',
      801: '#64748B',
      802: '#475569',
      803: '#334155',
      804: '#1E293B',

      // Unknown
      999: '#94A3B8',
    };

    if (weatherId !== null && colorByWeatherId[weatherId]) {
      return colorByWeatherId[weatherId];
    }

    // Fallback to category-level color if weather_id is missing.
    const category = (weatherCategory || '').toLowerCase();
    if (category.includes('thunder')) return '#7C3AED';
    if (category.includes('drizzle')) return '#0EA5E9';
    if (category.includes('rain')) return '#2563EB';
    if (category.includes('mist') || category.includes('haze') || category.includes('fog')) return '#6B7280';
    if (category.includes('clear') || category.includes('sunny')) return 'rgba(0,0,0,0)';
    if (category.includes('cloud')) return '#475569';

    return '#94A3B8';
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
