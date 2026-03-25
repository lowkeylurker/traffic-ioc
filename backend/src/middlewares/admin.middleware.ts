import { clerkClient } from '@clerk/express';
import { NextFunction, Request, Response } from 'express';

// Middleware to check if user has admin role
export const adminOnly = async (req: Request & { auth?: any }, res: Response, next: NextFunction) => {
  try {
    const auth = typeof req.auth === 'function' ? req.auth() : req.auth;
    const userId = auth?.userId as string | undefined;

    if (!userId) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Access denied. Admin role required.',
        timestamp: new Date().toISOString(),
      });
    }

    const user = await clerkClient.users.getUser(userId);
    const role = (user.publicMetadata as Record<string, unknown> | undefined)?.role;

    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Access denied. Admin role required.',
        timestamp: new Date().toISOString(),
      });
    }

    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'Access denied. Admin role required.',
      timestamp: new Date().toISOString(),
    });
  }
};
