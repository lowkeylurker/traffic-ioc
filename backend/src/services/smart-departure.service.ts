import { query } from '../config/db';
import { Logger } from '../utils/logger';

interface SmartDeparturePayload {
  segment_ids: string[];
  target_arrival_time: string;
  day_of_week: number;
}

interface SmartDepartureQueryRow {
  segment_key: string | number;
  bucket_time: string;
  avg_velocity_kmh: string | number;
  length_m: string | number | null;
}

interface SegmentVelocityProfile {
  lengthM: number | null;
  buckets: Map<number, number>;
}

export interface SmartDepartureSuggestion {
  departure_time: string;
  estimated_duration_minutes: number;
  is_optimal: boolean;
}

export interface SmartDepartureResult {
  target_arrival_time: string;
  suggestions: SmartDepartureSuggestion[];
}

const logger = new Logger('SmartDepartureService');
const CANDIDATE_OFFSETS_MINUTES = [30, 45, 60, 75, 90] as const;

const SMART_DEPARTURE_SQL = `
  WITH input_params AS (
    SELECT
      $1::bigint[] AS segment_keys,
      $2::int AS day_of_week,
      $3::time AS target_arrival_time,
      ($3::time - INTERVAL '2 hour')::time AS window_start
  ),
  bucketed AS (
    SELECT
      f.segment_key,
      (
        date_trunc('hour', f.timestamp)
        + make_interval(mins => ((EXTRACT(MINUTE FROM f.timestamp)::int / 15) * 15))
      ) AS bucket_ts,
      AVG(f.current_speed_kmh)::float8 AS avg_velocity_kmh
    FROM fact_traffic_flow f
    CROSS JOIN input_params p
    WHERE f.segment_key = ANY(p.segment_keys)
      AND EXTRACT(ISODOW FROM f.timestamp)::int = p.day_of_week
      AND f.current_speed_kmh IS NOT NULL
      AND f.current_speed_kmh > 0
      AND (
        (
          p.window_start <= p.target_arrival_time
          AND f.timestamp::time BETWEEN p.window_start AND p.target_arrival_time
        )
        OR (
          p.window_start > p.target_arrival_time
          AND (f.timestamp::time >= p.window_start OR f.timestamp::time <= p.target_arrival_time)
        )
      )
    GROUP BY f.segment_key, bucket_ts
  )
  SELECT
    b.segment_key,
    to_char(b.bucket_ts::time, 'HH24:MI') AS bucket_time,
    b.avg_velocity_kmh,
    COALESCE(s.length_m, 0)::float8 AS length_m
  FROM bucketed b
  LEFT JOIN dim_segment s ON s.segment_key = b.segment_key
  ORDER BY b.bucket_ts, b.segment_key;
`;

const parseTimeToMinutes = (value: string): number => {
  const [hh, mm] = value.split(':').map(Number);
  return hh * 60 + mm;
};

const normalizeMinutes = (value: number): number => {
  const mod = value % (24 * 60);
  return mod < 0 ? mod + 24 * 60 : mod;
};

const floorToQuarterHour = (minuteOfDay: number): number => {
  const normalized = normalizeMinutes(minuteOfDay);
  return Math.floor(normalized / 15) * 15;
};

const formatMinutesToTime = (minuteOfDay: number): string => {
  const normalized = normalizeMinutes(minuteOfDay);
  const hh = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const mm = (normalized % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
};

const resolveSpeedKmh = (profile: SegmentVelocityProfile, minuteOfDay: number): number | null => {
  const bucketMinute = floorToQuarterHour(minuteOfDay);
  const exactSpeed = profile.buckets.get(bucketMinute);

  if (exactSpeed && exactSpeed > 0) {
    return exactSpeed;
  }

  const availableBuckets = Array.from(profile.buckets.keys());
  if (availableBuckets.length === 0) {
    return null;
  }

  let bestMinute = availableBuckets[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidateMinute of availableBuckets) {
    const directDistance = Math.abs(candidateMinute - bucketMinute);
    const circularDistance = Math.min(directDistance, 24 * 60 - directDistance);
    if (circularDistance < bestDistance) {
      bestDistance = circularDistance;
      bestMinute = candidateMinute;
    }
  }

  const nearestSpeed = profile.buckets.get(bestMinute);
  if (nearestSpeed && nearestSpeed > 0) {
    return nearestSpeed;
  }

  return null;
};

const buildVelocityProfiles = (
  segmentIds: string[],
  rows: SmartDepartureQueryRow[]
): Map<string, SegmentVelocityProfile> => {
  const profiles = new Map<string, SegmentVelocityProfile>();

  for (const segmentId of segmentIds) {
    profiles.set(segmentId, {
      lengthM: null,
      buckets: new Map<number, number>(),
    });
  }

  for (const row of rows) {
    const segmentId = String(row.segment_key);
    if (!profiles.has(segmentId)) {
      continue;
    }

    const profile = profiles.get(segmentId);
    if (!profile) {
      continue;
    }

    const speedKmh = Number(row.avg_velocity_kmh);
    const lengthM = Number(row.length_m ?? 0);

    if (lengthM > 0) {
      profile.lengthM = lengthM;
    }

    if (Number.isFinite(speedKmh) && speedKmh > 0) {
      profile.buckets.set(parseTimeToMinutes(row.bucket_time), speedKmh);
    }
  }

  return profiles;
};

const estimateRouteDurationMinutes = (
  segmentIds: string[],
  profiles: Map<string, SegmentVelocityProfile>,
  departureMinute: number
): number => {
  let elapsedMinutes = 0;
  let traversalClockMinute = departureMinute;

  for (const segmentId of segmentIds) {
    const profile = profiles.get(segmentId);
    if (!profile || !profile.lengthM || profile.lengthM <= 0) {
      throw new Error(`SMART_DEPARTURE_DATA: Missing segment length for segment_id=${segmentId}`);
    }

    const speedKmh = resolveSpeedKmh(profile, traversalClockMinute);
    if (!speedKmh || speedKmh <= 0) {
      throw new Error(`SMART_DEPARTURE_DATA: Missing historical velocity for segment_id=${segmentId}`);
    }

    const segmentMinutes = (profile.lengthM / 1000 / speedKmh) * 60;
    elapsedMinutes += segmentMinutes;
    traversalClockMinute += segmentMinutes;
  }

  return elapsedMinutes;
};

export class SmartDepartureService {
  async getSuggestions(payload: SmartDeparturePayload): Promise<SmartDepartureResult> {
    const sqlResult = await query(SMART_DEPARTURE_SQL, [
      payload.segment_ids,
      payload.day_of_week,
      payload.target_arrival_time,
    ]);

    const rows = sqlResult.rows as SmartDepartureQueryRow[];
    const profiles = buildVelocityProfiles(payload.segment_ids, rows);

    const missingSegments = payload.segment_ids.filter((segmentId) => {
      const profile = profiles.get(segmentId);
      return !profile || profile.buckets.size === 0 || !profile.lengthM || profile.lengthM <= 0;
    });

    if (missingSegments.length > 0) {
      throw new Error(
        `SMART_DEPARTURE_DATA: Insufficient historical data for segment_ids=${missingSegments.join(',')}`
      );
    }

    const targetArrivalMinute = parseTimeToMinutes(payload.target_arrival_time);

    const suggestionDrafts = CANDIDATE_OFFSETS_MINUTES.map((offsetMinutes) => {
      const departureMinute = normalizeMinutes(targetArrivalMinute - offsetMinutes);
      const estimatedDuration = estimateRouteDurationMinutes(payload.segment_ids, profiles, departureMinute);
      const estimatedDurationRounded = Math.max(1, Math.round(estimatedDuration));
      const arrivesOnTime = estimatedDurationRounded <= offsetMinutes;

      return {
        departure_time: formatMinutesToTime(departureMinute),
        estimated_duration_minutes: estimatedDurationRounded,
        offsetMinutes,
        arrivesOnTime,
      };
    });

    const onTimeSuggestions = suggestionDrafts.filter((item) => item.arrivesOnTime);
    const optimalDuration =
      onTimeSuggestions.length > 0
        ? Math.min(...onTimeSuggestions.map((item) => item.estimated_duration_minutes))
        : null;

    const suggestions: SmartDepartureSuggestion[] = suggestionDrafts.map((item) => ({
      departure_time: item.departure_time,
      estimated_duration_minutes: item.estimated_duration_minutes,
      is_optimal:
        optimalDuration !== null &&
        item.arrivesOnTime &&
        item.estimated_duration_minutes === optimalDuration,
    }));

    logger.log('Smart departure suggestions computed', {
      segmentCount: payload.segment_ids.length,
      dayOfWeek: payload.day_of_week,
      targetArrivalTime: payload.target_arrival_time,
      sourceRows: rows.length,
      suggestions,
    });

    return {
      target_arrival_time: payload.target_arrival_time,
      suggestions,
    };
  }
}

export const smartDepartureService = new SmartDepartureService();
