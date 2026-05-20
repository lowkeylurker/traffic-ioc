import { requireAuth } from '@clerk/express';
import { NextFunction, Request, Response } from 'express';

const isBenchmarkAuthBypassEnabled = () =>
  process.env.BYPASS_AUTH_FOR_BENCHMARK === 'true' &&
  process.env.NODE_ENV !== 'production';

const benchmarkAuth = {
  userId: 'benchmark_admin',
  sessionClaims: {
    metadata: {
      role: 'admin',
    },
    publicMetadata: {
      role: 'admin',
    },
  },
};

// Middleware to authenticate requests
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (isBenchmarkAuthBypassEnabled()) {
    const headerUserId = req.header('x-benchmark-user-id');
    const requestUserId = typeof headerUserId === 'string' && headerUserId.trim()
      ? headerUserId.trim()
      : benchmarkAuth.userId;

    (req as Request & { auth?: typeof benchmarkAuth }).auth = {
      ...benchmarkAuth,
      userId: requestUserId,
    };

    return next();
  }

  return requireAuth()(req, res, next);
};
