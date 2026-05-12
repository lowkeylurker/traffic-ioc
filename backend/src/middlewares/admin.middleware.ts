import { Request, Response, NextFunction } from 'express';

// Middleware to check if user has admin role
export const adminOnly = (req: Request & { auth?: any }, res: Response, next: NextFunction) => {
  try {
    // Access role from Clerk session claims
    const role = (req.auth?.sessionClaims?.publicMetadata as any)?.role;

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
