// DTOs (Data Transfer Objects) for validation

import { z } from 'zod';

export const ForecastSchema = z.object({
  segmentId: z.number().int(),
  horizonMinutes: z.number().int().min(1).max(1440).default(60),
});

export type ForecastDto = z.infer<typeof ForecastSchema>;

export const RoutingSchema = z.object({
  startPoint: z.tuple([z.number(), z.number()]),
  endPoint: z.tuple([z.number(), z.number()]),
  blockedSegments: z.array(z.number().int()).optional(),
});

export type RoutingDto = z.infer<typeof RoutingSchema>;

const SmartDepartureSegmentIdSchema = z.union([
  z.string().regex(/^\d+$/, 'segment_ids must contain only numeric characters'),
  z.number().int().positive(),
]);

export const SmartDepartureSchema = z.object({
  segment_ids: z
    .array(SmartDepartureSegmentIdSchema)
    .min(1)
    .transform((values) => values.map((value) => String(value))),
  target_arrival_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'target_arrival_time must be in HH:mm format'),
  day_of_week: z.number().int().min(1).max(7),
});

export type SmartDepartureDto = z.infer<typeof SmartDepartureSchema>;

export const SegmentQuerySchema = z.object({
  limit: z.number().int().default(100),
  offset: z.number().int().default(0),
});

export type SegmentQueryDto = z.infer<typeof SegmentQuerySchema>;

export const ComparisonMetricSchema = z.enum([
  'currentSpeedKmh',
  'pcuVolume',
  'trafficIndex',
  'losScore',
  'congestionLevel',
  'delaySeconds',
  'occupancyRate',
  'bufferIndex',
]);

export const ComparisonScopeSchema = z.enum(['segment', 'road']);
export const ComparisonQuerySchema = z
  .object({
    scopeType: ComparisonScopeSchema.default('segment'),
    segmentId: z.string().regex(/^\d+$/, 'segmentId must be numeric').optional(),
    roadKey: z.string().regex(/^\d+$/, 'roadKey must be numeric').optional(),
    metric: ComparisonMetricSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  })
  .superRefine((value, ctx) => {
    if (value.scopeType === 'segment' && !value.segmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'segmentId is required when scopeType=segment',
        path: ['segmentId'],
      });
    }

    if (value.scopeType === 'road' && !value.roadKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'roadKey is required when scopeType=road',
        path: ['roadKey'],
      });
    }
  });

export type ComparisonMetricDto = z.infer<typeof ComparisonMetricSchema>;
export type ComparisonQueryDto = z.infer<typeof ComparisonQuerySchema>;
export type ComparisonScopeDto = z.infer<typeof ComparisonScopeSchema>;

export const CorridorDashboardQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  corridorKey: z.string().regex(/^\d+$/, 'corridorKey must be numeric').optional(),
});

export type CorridorDashboardQueryDto = z.infer<typeof CorridorDashboardQuerySchema>;

export const ReliabilityTimeWindowSchema = z.enum(['AM_PEAK', 'PM_PEAK', 'OFF_PEAK']);
export const ReliabilitySortBySchema = z.enum(['buffer_index', 'pti']);

export const ReliabilityQuerySchema = z.object({
  timeWindow: ReliabilityTimeWindowSchema.default('AM_PEAK'),
  sortBy: ReliabilitySortBySchema.default('buffer_index'),
  limit: z.coerce.number().int().min(1).max(10000).default(10),
  corridorKey: z.string().regex(/^\d+$/, 'corridorKey must be numeric').optional(),
});

export type ReliabilityQueryDto = z.infer<typeof ReliabilityQuerySchema>;

const HistoryDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Thời gian phải đúng định dạng YYYY-MM-DDTHH:mm[:ss]');

const refineHistoryDateRange = (value: { startDateTime: string; endDateTime: string }, ctx: z.RefinementCtx) => {
  const start = new Date(value.startDateTime);
  const end = new Date(value.endDateTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startDateTime/endDateTime phải là thời gian hợp lệ',
      path: ['startDateTime'],
    });
    return;
  }

  if (end < start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endDateTime phải lớn hơn hoặc bằng startDateTime',
      path: ['endDateTime'],
    });
    return;
  }

  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 7) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Khoảng thời gian không được vượt quá 7 ngày',
      path: ['endDateTime'],
    });
  }
};

export const HistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(1000).default(50),
    startDateTime: HistoryDateTimeSchema,
    endDateTime: HistoryDateTimeSchema,
    roadKey: z.string().min(1).optional(),
    roadName: z.string().min(1).optional(),
    minTrafficIndex: z.coerce.number().min(0).optional(),
  })
  .superRefine(refineHistoryDateRange);

export type HistoryQueryDto = z.infer<typeof HistoryQuerySchema>;

export const HistoryExportQuerySchema = z
  .object({
    startDateTime: HistoryDateTimeSchema,
    endDateTime: HistoryDateTimeSchema,
    roadKey: z.string().min(1).optional(),
    roadName: z.string().min(1).optional(),
    minTrafficIndex: z.coerce.number().min(0).optional(),
  })
  .superRefine(refineHistoryDateRange);

export type HistoryExportQueryDto = z.infer<typeof HistoryExportQuerySchema>;
