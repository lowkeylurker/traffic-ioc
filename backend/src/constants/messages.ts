// Các hằng số & messages cho toàn ứng dụng

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export const RESPONSE_MESSAGES = {
  SUCCESS: 'Operation successful',
  CREATED: 'Resource created successfully',
  BAD_REQUEST: 'Invalid request data',
  NOT_FOUND: 'Resource not found',
  INTERNAL_ERROR: 'Internal server error',
  DATABASE_ERROR: 'Database operation failed',
  VALIDATION_ERROR: 'Validation failed',
};

export const API_VERSIONS = {
  V1: '/api/v1',
};

export const ROUTE_PATHS = {
  MAP: '/map',
  ANALYTICS: '/analytics',
  SIMULATION: '/simulation',
};
