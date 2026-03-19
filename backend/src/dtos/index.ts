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
