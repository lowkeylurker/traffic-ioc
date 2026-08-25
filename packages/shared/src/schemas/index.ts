import { z } from 'zod'

export const IncidentTypeEnum = z.enum([
  'ACCIDENT',
  'FLOOD',
  'CONSTRUCTION',
  'FIRE',
  'OTHER',
])

export const IncidentSeverityEnum = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
])

export const IncidentStatusEnum = z.enum(['OPEN', 'RESOLVED', 'PENDING'])

export const CitizenReportStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
])

export const CreateCitizenReportSchema = z.object({
  incidentType: IncidentTypeEnum,
  description: z.string().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  roadName: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  long: z.number().min(-180).max(180),
})

export const ModerationReportSchema = z.object({
  status: CitizenReportStatusEnum,
  moderationNote: z.string().max(500).optional().nullable(),
})

export const QueryHistorySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  startDateTime: z.string(),
  endDateTime: z.string(),
  roadKey: z.string().optional(),
  roadName: z.string().optional(),
  minTrafficIndex: z.coerce.number().optional(),
})

export const RoutingQuerySchema = z.object({
  startLat: z.coerce.number().min(-90).max(90),
  startLon: z.coerce.number().min(-180).max(180),
  endLat: z.coerce.number().min(-90).max(90),
  endLon: z.coerce.number().min(-180).max(180),
  avoidBlocked: z.coerce.boolean().default(true),
})

export type CreateCitizenReportInput = z.infer<typeof CreateCitizenReportSchema>
export type ModerationReportInput = z.infer<typeof ModerationReportSchema>
export type QueryHistoryInput = z.infer<typeof QueryHistorySchema>
export type RoutingQueryInput = z.infer<typeof RoutingQuerySchema>

export * from './rag'
