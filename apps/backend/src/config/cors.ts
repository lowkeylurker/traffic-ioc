import { CorsOptions } from 'cors';

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

/**
 * Parses the CORS_ORIGIN environment variable into a sanitized array of allowed origins.
 * Supports comma-separated strings (e.g. "http://localhost:5173, http://localhost:3000"),
 * JSON arrays, single strings, and wildcards.
 */
export function getAllowedOrigins(rawOrigin?: string): string[] {
  const originStr = rawOrigin !== undefined ? rawOrigin : process.env.CORS_ORIGIN;

  if (!originStr || !originStr.trim()) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  const trimmed = originStr.trim();

  // Support JSON array format e.g. '["http://localhost:5173", "http://localhost:3000"]'
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Fall through to comma splitting
    }
  }

  return trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Generates CORS options for Express (cors middleware) and Socket.IO.
 * Dynamically validates origins and handles credentials properly.
 */
export function getCorsOptions(rawOrigin?: string): CorsOptions {
  return {
    origin: (requestOrigin, callback) => {
      const allowedOrigins = getAllowedOrigins(rawOrigin);

      // Allow requests with no origin (e.g. mobile apps, curl, Postman, server-to-server)
      if (!requestOrigin) {
        return callback(null, true);
      }

      // If wildcard '*' is configured, allow all origins
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Check exact match in allowed origins
      if (allowedOrigins.includes(requestOrigin)) {
        return callback(null, true);
      }

      // Origin not allowed
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Range', 'X-Content-Range', 'Content-Disposition'],
    maxAge: 86400,
  };
}

export const corsOptions = getCorsOptions();
