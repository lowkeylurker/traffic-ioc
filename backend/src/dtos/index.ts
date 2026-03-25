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
