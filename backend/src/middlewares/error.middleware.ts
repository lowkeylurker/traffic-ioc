// Global Error Handler Middleware

import { Request, Response, NextFunction } from 'express';
import { ResponseUtil } from '../utils/response';
import { Logger } from '../utils/logger';
import { HTTP_STATUS } from '../constants/messages';

const logger = new Logger('ErrorHandler');

export class AppError extends Error {
  constructor(public statusCode: number, public message: string, public errorCode?: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  logger.error(`${req.method} ${req.path}`, err);

  // Prisma errors
  if (err.code === 'P2025') {
    // Record not found
    res.status(HTTP_STATUS.NOT_FOUND).json(ResponseUtil.notFound('Record not found'));
    return;
  }

  if (err.code === 'P2002') {
    // Unique constraint violation
    res
      .status(HTTP_STATUS.CONFLICT)
      .json(ResponseUtil.error('Duplicate entry', HTTP_STATUS.CONFLICT, 'DUPLICATE_ENTRY'));
    return;
  }

  if (err.code === 'P2003') {
    // Foreign key constraint violation
    res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json(ResponseUtil.error('Invalid reference', HTTP_STATUS.BAD_REQUEST, 'INVALID_REFERENCE'));
    return;
  }

  // Custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json(ResponseUtil.error(err.message, err.statusCode, err.errorCode));
    return;
  }

  // Validation error
  if (err.statusCode === HTTP_STATUS.BAD_REQUEST && err.message?.includes('validation')) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(ResponseUtil.badRequest(err.message, err.details));
    return;
  }

  // Default internal error
  res
    .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    .json(ResponseUtil.internalError('An unexpected error occurred'));
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(HTTP_STATUS.NOT_FOUND).json(ResponseUtil.notFound(`Route ${req.path} not found`));
};
