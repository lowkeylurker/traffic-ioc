import { Request, Response, NextFunction } from 'express';
import { RagChatRequestSchema, RagFeedbackSchema } from '@traffic-ioc/shared';
import { ragOrchestrator } from '../rag/core/rag-orchestrator';
import { oltpPrisma } from '../config/oltp-prisma';
import { HTTP_STATUS } from '../constants/messages';
import { Logger } from '../utils/logger';

const logger = new Logger('RagController');

export class RagController {
  /**
   * SSE Streaming endpoint for Vietnamese Traffic Law Assistant
   * POST /api/v1/traffic-law/chat
   */
  public async streamChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    try {
      const parseResult = RagChatRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          error: parseResult.error.errors.map((e) => e.message).join(', '),
        });
        return;
      }

      const { message, sessionId, vehicleFilter } = parseResult.data;
      const userId = (req as any).auth?.userId || null;

      // Setup Server-Sent Events headers
      res.writeHead(HTTP_STATUS.OK, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Helper to emit SSE event
      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const { sessionId: activeSessionId, citations, streamResult } =
        await ragOrchestrator.streamChat({
          message,
          sessionId,
          vehicleFilter,
          userId,
        });

      // 1. Emit citations event first
      sendEvent('citations', { citations });

      let fullResponseText = '';

      // 2. Stream tokens as they arrive
      for await (const token of streamResult.textStream) {
        fullResponseText += token;
        sendEvent('token', { token });
      }

      const latencyMs = Date.now() - startTime;

      // 3. Save assistant message and latency to OLTP
      let savedMessageId = `msg-${Date.now()}`;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeSessionId);
      if (isUuid) {
        try {
          const msgDelegate = (oltpPrisma as any).chatMessage || (oltpPrisma as any).chat_message;
          const assistantMsg = await msgDelegate?.create({
            data: {
              sessionId: activeSessionId,
              role: 'assistant',
              content: fullResponseText,
              citations: citations as any,
              latencyMs: latencyMs,
            },
          });
          if (assistantMsg?.id) {
            savedMessageId = assistantMsg.id;
          }
        } catch (dbErr) {
          logger.warn('Failed to persist assistant message to OLTP:', dbErr);
        }
      }

      // 4. Emit done event
      sendEvent('done', {
        messageId: savedMessageId,
        sessionId: activeSessionId,
      });

      res.end();
    } catch (error: any) {
      logger.error('Error during RAG streaming:', error);
      if (!res.headersSent) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          success: false,
          error: error.message || 'Internal server error during chat stream.',
        });
      } else {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            error: error.message || 'Streaming failed',
          })}\n\n`
        );
        res.end();
      }
    }
  }

  /**
   * Feedback submission endpoint
   * POST /api/v1/traffic-law/feedback
   */
  public async submitFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = RagFeedbackSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          error: parseResult.error.errors.map((e) => e.message).join(', '),
        });
        return;
      }

      const { messageId, rating, comment } = parseResult.data;

      const feedbackDelegate = (oltpPrisma as any).chatFeedback || (oltpPrisma as any).chat_feedback;
      const feedback = await feedbackDelegate?.create({
        data: {
          messageId: messageId,
          rating,
          comment: comment || null,
        },
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Feedback submitted successfully',
        data: feedback,
      });
    } catch (error: any) {
      logger.error('Error submitting feedback:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error.message || 'Failed to submit feedback',
      });
    }
  }
}

export const ragController = new RagController();
export default ragController;
