import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middlewares/error.middleware';
import { Logger } from '../utils/logger';

const logger = new Logger('OlapMartService');

export interface OlapRefreshPayload {
  fromDate: string;
  toDate: string;
}

export interface OlapFilterQuery {
  startDate: Date;
  endDate: Date;
  districts: string[];
  weatherImpactMin: number;
  weatherImpactMax: number;
}

interface HeatmapRow {
  day_of_week_idx: number;
  hour_of_day: number;
  avg_tti: number;
}

interface ScatterRow {
  weather_impact_score: number;
  avg_tti: number;
  incident_count: number;
  district: string;
}

interface DrilldownRow {
  bucket: string;
  avg_tti: number;
  incident_count: number;
}

interface DistrictRow {
  district: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const parseIsoDate = (value: string, fieldName: string): Date => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, `${fieldName} must be a valid ISO date`, 'BAD_REQUEST');
  }
  return d;
};

const toFinite = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const daysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();

const weatherCategoryExpr = Prisma.sql`
  COALESCE(NULLIF(TRIM(dw.main_category), ''), NULLIF(TRIM(dw.name), ''), 'unknown')
`;

const weatherImpactFromCategoryExpr = Prisma.sql`
  (
    CASE
      WHEN COALESCE(weather_category, '') ILIKE '%thunder%' THEN 50
      WHEN COALESCE(weather_category, '') ILIKE '%storm%' THEN 45
      WHEN COALESCE(weather_category, '') ILIKE '%rain%' THEN 30
      WHEN COALESCE(weather_category, '') ILIKE '%drizzle%' THEN 15
      WHEN COALESCE(weather_category, '') ILIKE '%snow%' THEN 55
      WHEN COALESCE(weather_category, '') ILIKE '%fog%' THEN 20
      ELSE 5
    END
  )::float8
`;

export class OlapMartService {
  private tableReady = false;

  async ensureMartTable(): Promise<void> {
    if (this.tableReady) return;

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'report_olap_slot_district'
            AND column_name = 'weather_impact_score'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'report_olap_slot_district'
            AND column_name = 'weather_category'
        ) THEN
          DROP TABLE IF EXISTS report_olap_slot_district;
        END IF;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS report_olap_slot_district (
        date_key int NOT NULL,
        full_date date NOT NULL,
        year smallint NOT NULL,
        month smallint NOT NULL,
        day_of_month smallint NOT NULL,
        day_of_week_idx smallint NOT NULL,
        hour_of_day smallint NOT NULL,
        district varchar(100) NOT NULL,
        weather_category varchar(50) NOT NULL,
        avg_tti numeric(10,4) NOT NULL,
        sample_count int NOT NULL,
        incident_count int NOT NULL DEFAULT 0,
        computed_at timestamp NOT NULL DEFAULT NOW(),
        PRIMARY KEY (date_key, hour_of_day, district, weather_category)
      )
    `);

    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_report_olap_slot_date ON report_olap_slot_district (full_date)'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_report_olap_slot_day_hour ON report_olap_slot_district (day_of_week_idx, hour_of_day)'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_report_olap_slot_weather_category ON report_olap_slot_district (weather_category)'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_report_olap_slot_district ON report_olap_slot_district (district)'
    );

    this.tableReady = true;
  }

  async isMartEmpty(): Promise<boolean> {
    await this.ensureMartTable();
    const rows = await prisma.$queryRaw<Array<{ has_rows: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM report_olap_slot_district LIMIT 1) AS has_rows
    `;
    return !(rows[0]?.has_rows ?? false);
  }

  async getDistrictOptions(): Promise<string[]> {
    const rows = await prisma.$queryRaw<DistrictRow[]>`
      SELECT DISTINCT TRIM(district) AS district
      FROM dim_location
      WHERE district IS NOT NULL
        AND TRIM(district) <> ''
      ORDER BY district ASC
    `;

    return rows
      .map((r) => r.district)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  async refreshRange(payload: OlapRefreshPayload): Promise<{ upsertedRows: number }> {
    await this.ensureMartTable();

    const fromDate = parseIsoDate(payload.fromDate, 'fromDate');
    const toDate = parseIsoDate(payload.toDate, 'toDate');

    if (toDate < fromDate) {
      throw new AppError(400, 'toDate must be greater than or equal to fromDate', 'BAD_REQUEST');
    }

    logger.log(`Refreshing OLAP mart from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    const rows = await prisma.$queryRaw<Array<{ upserted_rows: number }>>(Prisma.sql`
      WITH traffic_base AS (
        SELECT
          dd.date_key,
          dd.full_date,
          EXTRACT(YEAR FROM dd.full_date)::int AS year,
          EXTRACT(MONTH FROM dd.full_date)::int AS month,
          EXTRACT(DAY FROM dd.full_date)::int AS day_of_month,
          ((dd.day_of_week + 5) % 7)::int AS day_of_week_idx,
          COALESCE(dt.bucket_60min_key, FLOOR((COALESCE(dt.hhmm, 0) / 100.0)))::int AS hour_of_day,
          COALESCE(dl.district, 'UNKNOWN') AS district,
          ${weatherCategoryExpr} AS weather_category,
          CASE
            WHEN ftf.current_speed_kmh IS NOT NULL
              AND ftf.current_speed_kmh > 0
              AND ftf.free_flow_speed_kmh IS NOT NULL
              AND ftf.free_flow_speed_kmh > 0
            THEN (ftf.free_flow_speed_kmh / ftf.current_speed_kmh)
            ELSE NULL
          END AS tti,
          ftf.time_key
        FROM fact_traffic_flow ftf
        INNER JOIN dim_date dd ON dd.date_key = ftf.date_key
        INNER JOIN dim_time_of_day dt ON dt.time_key = ftf.time_key
        INNER JOIN dim_segment ds ON ds.segment_key = ftf.segment_key
        LEFT JOIN dim_location dl ON dl.location_key = ds.location_key
        LEFT JOIN dim_weather dw ON dw.weather_key = ftf.weather_key
        WHERE dd.full_date BETWEEN ${fromDate}::date AND ${toDate}::date
      ),
      traffic_agg AS (
        SELECT
          date_key,
          full_date,
          year,
          month,
          day_of_month,
          day_of_week_idx,
          hour_of_day,
          district,
          weather_category,
          AVG(tti)::numeric(10,4) AS avg_tti,
          COUNT(*)::int AS sample_count,
          MIN(time_key) AS sample_time_key
        FROM traffic_base
        WHERE tti IS NOT NULL
          AND hour_of_day BETWEEN 0 AND 23
        GROUP BY
          date_key,
          full_date,
          year,
          month,
          day_of_month,
          day_of_week_idx,
          hour_of_day,
          district,
          weather_category
      ),
      incident_agg AS (
        SELECT
          fi.date_key,
          COALESCE(dt.bucket_60min_key, FLOOR((COALESCE(dt.hhmm, 0) / 100.0)))::int AS hour_of_day,
          COALESCE(spatial_loc.district, dl.district, dls.district, 'UNKNOWN') AS district,
          COUNT(*)::int AS incident_count
        FROM fact_incident fi
        INNER JOIN dim_date dd ON dd.date_key = fi.date_key
        INNER JOIN dim_time_of_day dt ON dt.time_key = fi.time_key
        LEFT JOIN dim_location dl ON dl.location_key = fi.location_key
        LEFT JOIN dim_segment ds ON ds.segment_key = fi.segment_key
        LEFT JOIN dim_location dls ON dls.location_key = ds.location_key
        LEFT JOIN LATERAL (
          SELECT dlp.district
          FROM dim_location dlp
          CROSS JOIN LATERAL (
            SELECT
              COALESCE(
                CASE WHEN fi.geometry IS NOT NULL THEN ST_PointOnSurface(fi.geometry) END,
                ds.geometry_center,
                CASE WHEN ds.geometry_linestring IS NOT NULL THEN ST_PointOnSurface(ds.geometry_linestring) END
              ) AS incident_point
          ) ip
          WHERE dlp.geometry_polygon IS NOT NULL
            AND ip.incident_point IS NOT NULL
            AND (
              CASE
                WHEN ST_SRID(ip.incident_point) = 0 THEN
                  ST_Covers(
                    dlp.geometry_polygon,
                    ST_SetSRID(ip.incident_point, ST_SRID(dlp.geometry_polygon))
                  )
                WHEN ST_SRID(ip.incident_point) = ST_SRID(dlp.geometry_polygon) THEN
                  ST_Covers(dlp.geometry_polygon, ip.incident_point)
                ELSE
                  ST_Covers(
                    dlp.geometry_polygon,
                    ST_Transform(ip.incident_point, ST_SRID(dlp.geometry_polygon))
                  )
              END
            )
          ORDER BY dlp.location_key
          LIMIT 1
        ) AS spatial_loc ON TRUE
        WHERE dd.full_date BETWEEN ${fromDate}::date AND ${toDate}::date
        GROUP BY
          fi.date_key,
          COALESCE(dt.bucket_60min_key, FLOOR((COALESCE(dt.hhmm, 0) / 100.0)))::int,
          COALESCE(spatial_loc.district, dl.district, dls.district, 'UNKNOWN')
      ),
      upserted AS (
        INSERT INTO report_olap_slot_district (
          date_key,
          full_date,
          year,
          month,
          day_of_month,
          day_of_week_idx,
          hour_of_day,
          district,
          weather_category,
          avg_tti,
          sample_count,
          incident_count,
          computed_at
        )
        SELECT
          ta.date_key,
          ta.full_date,
          ta.year,
          ta.month,
          ta.day_of_month,
          ta.day_of_week_idx,
          ta.hour_of_day,
          ta.district,
          ta.weather_category,
          ta.avg_tti,
          ta.sample_count,
          COALESCE(ia.incident_count, 0) AS incident_count,
          NOW()
        FROM traffic_agg ta
        LEFT JOIN incident_agg ia
          ON ia.date_key = ta.date_key
          AND ia.hour_of_day = ta.hour_of_day
          AND ia.district = ta.district
        ON CONFLICT (date_key, hour_of_day, district, weather_category)
        DO UPDATE SET
          avg_tti = EXCLUDED.avg_tti,
          sample_count = EXCLUDED.sample_count,
          incident_count = EXCLUDED.incident_count,
          computed_at = EXCLUDED.computed_at,
          full_date = EXCLUDED.full_date,
          year = EXCLUDED.year,
          month = EXCLUDED.month,
          day_of_month = EXCLUDED.day_of_month,
          day_of_week_idx = EXCLUDED.day_of_week_idx
        RETURNING 1
      )
      SELECT COUNT(*)::int AS upserted_rows FROM upserted
    `);

    const upsertedRows = rows[0]?.upserted_rows ?? 0;
    logger.log(`OLAP mart refresh complete, upserted=${upsertedRows}`);
    return { upsertedRows };
  }

  private buildDistrictFilter(districts: string[]): Prisma.Sql {
    if (!districts.length) return Prisma.empty;
    return Prisma.sql`AND district IN (${Prisma.join(districts)})`;
  }

  async getHeatmap(query: OlapFilterQuery): Promise<Array<[number, number, number]>> {
    await this.ensureMartTable();

    const districtFilter = this.buildDistrictFilter(query.districts);
    const rows = await prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
      SELECT
        day_of_week_idx,
        hour_of_day,
        AVG(avg_tti)::float8 AS avg_tti
      FROM report_olap_slot_district
      WHERE full_date BETWEEN ${query.startDate}::date AND ${query.endDate}::date
        AND ${weatherImpactFromCategoryExpr} BETWEEN ${query.weatherImpactMin} AND ${query.weatherImpactMax}
        ${districtFilter}
      GROUP BY day_of_week_idx, hour_of_day
    `);

    const map = new Map<string, number>();
    rows.forEach((r) => {
      map.set(`${r.day_of_week_idx}-${r.hour_of_day}`, Number(toFinite(r.avg_tti, 1).toFixed(2)));
    });

    const data: Array<[number, number, number]> = [];
    for (let d = 0; d < 7; d += 1) {
      for (let h = 0; h < 24; h += 1) {
        data.push([d, h, map.get(`${d}-${h}`) ?? 1]);
      }
    }
    return data;
  }

  async getScatter(query: OlapFilterQuery): Promise<ScatterRow[]> {
    await this.ensureMartTable();

    const districtFilter = this.buildDistrictFilter(query.districts);
    const rows = await prisma.$queryRaw<ScatterRow[]>(Prisma.sql`
      SELECT
        ${weatherImpactFromCategoryExpr} AS weather_impact_score,
        AVG(avg_tti)::float8 AS avg_tti,
        SUM(incident_count)::int AS incident_count,
        district
      FROM report_olap_slot_district
      WHERE full_date BETWEEN ${query.startDate}::date AND ${query.endDate}::date
        AND ${weatherImpactFromCategoryExpr} BETWEEN ${query.weatherImpactMin} AND ${query.weatherImpactMax}
        ${districtFilter}
      GROUP BY district, weather_category
      ORDER BY district, weather_impact_score
      LIMIT 600
    `);

    return rows.map((r) => ({
      district: r.district,
      weather_impact_score: Number(toFinite(r.weather_impact_score, 0).toFixed(1)),
      avg_tti: Number(toFinite(r.avg_tti, 1).toFixed(2)),
      incident_count: Math.max(0, Math.round(toFinite(r.incident_count, 0))),
    }));
  }

  async getDrilldownYear(query: OlapFilterQuery, year: number): Promise<DrilldownRow[]> {
    await this.ensureMartTable();

    const districtFilter = this.buildDistrictFilter(query.districts);
    const rows = await prisma.$queryRaw<DrilldownRow[]>(Prisma.sql`
      WITH months AS (
        SELECT generate_series(1, 12)::int AS month_no
      ),
      agg AS (
        SELECT
          month,
          AVG(avg_tti)::float8 AS avg_tti,
          SUM(incident_count)::int AS incident_count
        FROM report_olap_slot_district
        WHERE year = ${year}
          AND ${weatherImpactFromCategoryExpr} BETWEEN ${query.weatherImpactMin} AND ${query.weatherImpactMax}
          ${districtFilter}
        GROUP BY month
      )
      SELECT
        CONCAT('Tháng ', m.month_no) AS bucket,
        COALESCE(a.avg_tti, 0)::float8 AS avg_tti,
        COALESCE(a.incident_count, 0)::int AS incident_count
      FROM months m
      LEFT JOIN agg a ON a.month = m.month_no
      ORDER BY m.month_no
    `);

    return rows.map((r) => ({
      bucket: r.bucket,
      avg_tti: Number(toFinite(r.avg_tti, 0).toFixed(2)),
      incident_count: Math.max(0, Math.round(toFinite(r.incident_count, 0))),
    }));
  }

  async getDrilldownMonth(query: OlapFilterQuery, year: number, month: number): Promise<DrilldownRow[]> {
    await this.ensureMartTable();

    const districtFilter = this.buildDistrictFilter(query.districts);
    const maxDay = daysInMonth(year, month);

    const rows = await prisma.$queryRaw<DrilldownRow[]>(Prisma.sql`
      WITH days AS (
        SELECT generate_series(1, ${maxDay})::int AS day_no
      ),
      agg AS (
        SELECT
          day_of_month,
          AVG(avg_tti)::float8 AS avg_tti,
          SUM(incident_count)::int AS incident_count
        FROM report_olap_slot_district
        WHERE year = ${year}
          AND month = ${month}
          AND ${weatherImpactFromCategoryExpr} BETWEEN ${query.weatherImpactMin} AND ${query.weatherImpactMax}
          ${districtFilter}
        GROUP BY day_of_month
      )
      SELECT
        CONCAT('Ngày ', d.day_no) AS bucket,
        COALESCE(a.avg_tti, 0)::float8 AS avg_tti,
        COALESCE(a.incident_count, 0)::int AS incident_count
      FROM days d
      LEFT JOIN agg a ON a.day_of_month = d.day_no
      ORDER BY d.day_no
    `);

    return rows.map((r) => ({
      bucket: r.bucket,
      avg_tti: Number(toFinite(r.avg_tti, 0).toFixed(2)),
      incident_count: Math.max(0, Math.round(toFinite(r.incident_count, 0))),
    }));
  }

  normalizeFilter(input: {
    startDate?: string;
    endDate?: string;
    districts?: string;
    weatherImpactMin?: string | number;
    weatherImpactMax?: string | number;
    rainfallMin?: string | number;
    rainfallMax?: string | number;
  }): OlapFilterQuery {
    const startDate = input.startDate
      ? parseIsoDate(input.startDate, 'startDate')
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = input.endDate ? parseIsoDate(input.endDate, 'endDate') : new Date();

    if (endDate < startDate) {
      throw new AppError(400, 'endDate must be greater than or equal to startDate', 'BAD_REQUEST');
    }

    const districts = (input.districts ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, 20);

    const minInput = input.weatherImpactMin ?? input.rainfallMin ?? 0;
    const maxInput = input.weatherImpactMax ?? input.rainfallMax ?? 120;
    const weatherImpactMin = clamp(Number(minInput) || 0, 0, 300);
    const weatherImpactMax = clamp(Number(maxInput) || 120, weatherImpactMin, 300);

    return {
      startDate,
      endDate,
      districts,
      weatherImpactMin,
      weatherImpactMax,
    };
  }
}

export const olapMartService = new OlapMartService();
