import { requireAuth } from '@clerk/express';

// Middleware to authenticate requests
export const authMiddleware = requireAuth();
