import { NextFunction, Request, Response } from 'express';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;

const getClientKey = (req: Request & { auth?: any }): string => {
  const userId = req.auth?.userId as string | undefined;
  if (userId) {
    return `uid:${userId}`;
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
};

export const reportRateLimit = (req: Request & { auth?: any }, res: Response, next: NextFunction) => {
  const key = getClientKey(req);
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return next();
  }

  if (current.count >= LIMIT) {
    return res.status(429).json({
      success: false,
      statusCode: 429,
      message: 'Too many reports. Please try again later.',
      timestamp: new Date().toISOString(),
    });
  }

  current.count += 1;
  buckets.set(key, current);
  return next();
};
