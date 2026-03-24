import { NextFunction, Request, Response } from 'express';

// Middleware to check if user has admin role
export const adminOnly = (req: Request & { auth?: any }, res: Response, next: NextFunction) => {
  try {
    // Access role from Clerk session claims (support both top-level and metadata claim layouts).
    const claims = req.auth?.sessionClaims as any;
    const role = claims?.role || claims?.publicMetadata?.role;

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
