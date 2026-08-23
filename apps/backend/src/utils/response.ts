// Response utility - chuẩn hóa định dạng response

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  timestamp: string;
  error?: {
    code?: string;
    details?: any;
  };
}

export class ResponseUtil {
  static success<T>(data: T, message: string = 'Operation successful', statusCode: number = 200): ApiResponse<T> {
    return {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  static error(
    message: string,
    statusCode: number = 500,
    errorCode?: string,
    details?: any
  ): ApiResponse {
    return {
      success: false,
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      error: {
        code: errorCode,
        details,
      },
    };
  }

  static created<T>(data: T, message: string = 'Resource created successfully'): ApiResponse<T> {
    return this.success(data, message, 201);
  }

  static notFound(message: string = 'Resource not found'): ApiResponse {
    return this.error(message, 404, 'NOT_FOUND');
  }

  static badRequest(message: string = 'Invalid request data', details?: any): ApiResponse {
    return this.error(message, 400, 'BAD_REQUEST', details);
  }

  static internalError(message: string = 'Internal server error'): ApiResponse {
    return this.error(message, 500, 'INTERNAL_ERROR');
  }
}
