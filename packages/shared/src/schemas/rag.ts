import { z } from 'zod'

export const VehicleTypeEnum = z.enum([
  'MOTORBIKE',
  'CAR',
  'TRUCK',
  'OTHER',
  'ALL',
])

export const RagChatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  sessionId: z.string().uuid().optional().nullable(),
  vehicleFilter: VehicleTypeEnum.optional().nullable(),
})

export const LegalCitationSchema = z.object({
  docCode: z.string().min(1),
  articleNumber: z.number().int().positive(),
  clauseNumber: z.number().int().positive().optional().nullable(),
  pointCode: z.string().optional().nullable(),
  breadcrumb: z.string().optional().nullable(),
  fineMin: z.number().min(0).optional().nullable(),
  fineMax: z.number().min(0).optional().nullable(),
  suspensionMonths: z.number().min(0).optional().nullable(),
  title: z.string().optional().nullable(),
  sourceUrl: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(),
})

export const RagFeedbackSchema = z.object({
  messageId: z.string().uuid(),
  rating: z.number().int(),
  comment: z.string().max(1000).optional().nullable(),
})

export const RagCitationEventSchema = z.object({
  event: z.literal('citations'),
  data: z.object({
    citations: z.array(LegalCitationSchema),
  }),
})

export const RagTokenEventSchema = z.object({
  event: z.literal('token'),
  data: z.object({
    token: z.string(),
  }),
})

export const RagDoneEventSchema = z.object({
  event: z.literal('done'),
  data: z.object({
    messageId: z.string().optional(),
    sessionId: z.string().optional(),
  }),
})

export const RagErrorEventSchema = z.object({
  event: z.literal('error'),
  data: z.object({
    error: z.string(),
  }),
})

export const RagStreamEventSchema = z.discriminatedUnion('event', [
  RagCitationEventSchema,
  RagTokenEventSchema,
  RagDoneEventSchema,
  RagErrorEventSchema,
])

export type VehicleType = z.infer<typeof VehicleTypeEnum>
export type RagChatRequestInput = z.infer<typeof RagChatRequestSchema>
export type LegalCitation = z.infer<typeof LegalCitationSchema>
export type RagFeedbackInput = z.infer<typeof RagFeedbackSchema>
export type RagCitationEvent = z.infer<typeof RagCitationEventSchema>
export type RagTokenEvent = z.infer<typeof RagTokenEventSchema>
export type RagDoneEvent = z.infer<typeof RagDoneEventSchema>
export type RagErrorEvent = z.infer<typeof RagErrorEventSchema>
export type RagStreamEvent = z.infer<typeof RagStreamEventSchema>
