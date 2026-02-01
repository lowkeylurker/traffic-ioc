import { ClerkExpressWithAuth } from '@clerk/clerk-sdk-node';

// Middleware to authenticate requests
export const authMiddleware = ClerkExpressWithAuth();
