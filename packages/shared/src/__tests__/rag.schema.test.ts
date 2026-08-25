import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  VehicleTypeEnum,
  RagChatRequestSchema,
  LegalCitationSchema,
  RagFeedbackSchema,
  RagStreamEventSchema,
} from '../schemas/rag'

describe('RAG Schemas (TDD)', () => {
  describe('VehicleTypeEnum', () => {
    it('should validate allowed vehicle types', () => {
      const validTypes = ['MOTORBIKE', 'CAR', 'TRUCK', 'OTHER', 'ALL']
      for (const type of validTypes) {
        const result = VehicleTypeEnum.safeParse(type)
        assert.equal(result.success, true, `Expected ${type} to be valid`)
      }
    })

    it('should reject invalid vehicle types', () => {
      const invalidTypes = ['PLANE', 'SUBMARINE', 'UNKNOWN', '', 123, null]
      for (const type of invalidTypes) {
        const result = VehicleTypeEnum.safeParse(type)
        assert.equal(result.success, false, `Expected ${String(type)} to be rejected`)
      }
    })
  })

  describe('RagChatRequestSchema', () => {
    it('should validate valid chat requests with required fields only', () => {
      const payload = {
        message: 'Vượt đèn đỏ xe máy phạt bao nhiêu tiền?',
      }
      const result = RagChatRequestSchema.safeParse(payload)
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.message, payload.message)
      }
    })

    it('should validate full chat requests with optional sessionId and vehicleFilter', () => {
      const payload = {
        message: 'Chạy quá tốc độ 15km/h xe ô tô phạt bao nhiêu?',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        vehicleFilter: 'CAR',
      }
      const result = RagChatRequestSchema.safeParse(payload)
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.message, payload.message)
        assert.equal(result.data.sessionId, payload.sessionId)
        assert.equal(result.data.vehicleFilter, 'CAR')
      }
    })

    it('should reject empty or whitespace-only messages', () => {
      const emptyResult = RagChatRequestSchema.safeParse({ message: '' })
      assert.equal(emptyResult.success, false)
    })

    it('should reject invalid sessionId format if provided', () => {
      const result = RagChatRequestSchema.safeParse({
        message: 'Hỏi luật',
        sessionId: 'invalid-uuid-123',
      })
      assert.equal(result.success, false)
    })

    it('should reject invalid vehicleFilter', () => {
      const result = RagChatRequestSchema.safeParse({
        message: 'Hỏi luật',
        vehicleFilter: 'INVALID_VEHICLE',
      })
      assert.equal(result.success, false)
    })
  })

  describe('LegalCitationSchema', () => {
    it('should validate a complete legal citation payload', () => {
      const citation = {
        docCode: '100/2019/NĐ-CP',
        articleNumber: 6,
        clauseNumber: 4,
        pointCode: 'a',
        breadcrumb: 'Nghị định 100/2019/NĐ-CP > Chương II > Điều 6 > Khoản 4 > Điểm a',
        fineMin: 800000,
        fineMax: 1000000,
        suspensionMonths: 2,
        title: 'Xử phạt người điều khiển xe mô tô, xe gắn máy vi phạm quy tắc giao thông đường bộ',
        sourceUrl: 'https://thuvienphapluat.vn/van-ban/Giao-thong-Van-tai/Nghi-dinh-100-2019-ND-CP-xu-phat-vi-pham-hanh-chinh-giao-thong-duong-bo-duong-sat-430063.aspx',
      }
      const result = LegalCitationSchema.safeParse(citation)
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.docCode, '100/2019/NĐ-CP')
        assert.equal(result.data.articleNumber, 6)
        assert.equal(result.data.clauseNumber, 4)
        assert.equal(result.data.pointCode, 'a')
        assert.equal(result.data.fineMin, 800000)
        assert.equal(result.data.fineMax, 1000000)
        assert.equal(result.data.suspensionMonths, 2)
      }
    })

    it('should validate minimal citation with optional fields omitted or null', () => {
      const citation = {
        docCode: '100/2019/NĐ-CP',
        articleNumber: 6,
      }
      const result = LegalCitationSchema.safeParse(citation)
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.docCode, '100/2019/NĐ-CP')
        assert.equal(result.data.articleNumber, 6)
      }
    })

    it('should reject citation without required docCode or articleNumber', () => {
      const noDocCode = { articleNumber: 6 }
      assert.equal(LegalCitationSchema.safeParse(noDocCode).success, false)

      const noArticle = { docCode: '100/2019/NĐ-CP' }
      assert.equal(LegalCitationSchema.safeParse(noArticle).success, false)
    })

    it('should reject citation with negative fine amounts or negative suspension', () => {
      const negativeFine = {
        docCode: '100/2019/NĐ-CP',
        articleNumber: 6,
        fineMin: -50000,
      }
      assert.equal(LegalCitationSchema.safeParse(negativeFine).success, false)

      const negativeSuspension = {
        docCode: '100/2019/NĐ-CP',
        articleNumber: 6,
        suspensionMonths: -1,
      }
      assert.equal(LegalCitationSchema.safeParse(negativeSuspension).success, false)
    })
  })

  describe('RagFeedbackSchema', () => {
    it('should validate positive and negative ratings with comments', () => {
      const feedback1 = {
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        rating: 1,
        comment: 'Câu trả lời rất chính xác và đầy đủ căn cứ pháp luật',
      }
      const result1 = RagFeedbackSchema.safeParse(feedback1)
      assert.equal(result1.success, true)

      const feedback2 = {
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        rating: -1,
      }
      const result2 = RagFeedbackSchema.safeParse(feedback2)
      assert.equal(result2.success, true)
    })

    it('should reject feedback with invalid messageId', () => {
      const invalid = {
        messageId: 'not-a-uuid',
        rating: 1,
      }
      const result = RagFeedbackSchema.safeParse(invalid)
      assert.equal(result.success, false)
    })

    it('should reject feedback without rating', () => {
      const invalid = {
        messageId: '550e8400-e29b-41d4-a716-446655440000',
      }
      const result = RagFeedbackSchema.safeParse(invalid)
      assert.equal(result.success, false)
    })
  })

  describe('RagStreamEventSchema', () => {
    it('should validate citations stream event', () => {
      const event = {
        event: 'citations',
        data: {
          citations: [
            {
              docCode: '100/2019/NĐ-CP',
              articleNumber: 6,
              clauseNumber: 4,
              pointCode: 'a',
              fineMin: 800000,
              fineMax: 1000000,
            },
          ],
        },
      }
      const result = RagStreamEventSchema.safeParse(event)
      assert.equal(result.success, true)
    })

    it('should validate token stream event', () => {
      const event = {
        event: 'token',
        data: {
          token: 'Theo quy định tại Nghị định 100...',
        },
      }
      const result = RagStreamEventSchema.safeParse(event)
      assert.equal(result.success, true)
    })

    it('should validate done stream event', () => {
      const event = {
        event: 'done',
        data: {
          messageId: '550e8400-e29b-41d4-a716-446655440000',
          sessionId: '550e8400-e29b-41d4-a716-446655440001',
        },
      }
      const result = RagStreamEventSchema.safeParse(event)
      assert.equal(result.success, true)
    })

    it('should validate error stream event', () => {
      const event = {
        event: 'error',
        data: {
          error: 'Rate limit exceeded',
        },
      }
      const result = RagStreamEventSchema.safeParse(event)
      assert.equal(result.success, true)
    })
  })
})
