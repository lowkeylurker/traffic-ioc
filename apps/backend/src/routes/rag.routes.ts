import { Router } from 'express';
import { ragController } from '../controllers/rag.controller';

const router = Router();

/**
 * @route   POST /api/v1/traffic-law/chat
 * @desc    SSE Streaming chat endpoint for Vietnamese traffic legislation assistant
 * @access  Public / Authenticated
 */
router.post('/chat', (req, res, next) =>
  ragController.streamChat(req, res, next)
);

// Backward alias within router
router.post('/traffic-law/chat', (req, res, next) =>
  ragController.streamChat(req, res, next)
);

/**
 * @route   POST /api/v1/traffic-law/feedback
 * @desc    Submit user feedback/rating for a response
 * @access  Public / Authenticated
 */
router.post('/feedback', (req, res, next) =>
  ragController.submitFeedback(req, res, next)
);

export default router;
