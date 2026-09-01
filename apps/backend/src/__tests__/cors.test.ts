import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import {
  getAllowedOrigins,
  getCorsOptions,
  DEFAULT_ALLOWED_ORIGINS,
} from '../config/cors';

describe('CORS Configuration', () => {
  describe('getAllowedOrigins', () => {
    it('should return default origins when rawOrigin is undefined or empty', () => {
      expect(getAllowedOrigins('')).toEqual(DEFAULT_ALLOWED_ORIGINS);
      expect(getAllowedOrigins('   ')).toEqual(DEFAULT_ALLOWED_ORIGINS);
    });

    it('should parse a single origin string', () => {
      expect(getAllowedOrigins('http://localhost:5173')).toEqual([
        'http://localhost:5173',
      ]);
    });

    it('should parse comma-separated multiple origins and trim whitespace', () => {
      const input = 'http://localhost:5173, http://localhost:3000, https://traffic.ioc.vn';
      expect(getAllowedOrigins(input)).toEqual([
        'http://localhost:5173',
        'http://localhost:3000',
        'https://traffic.ioc.vn',
      ]);
    });

    it('should parse JSON array format', () => {
      const input = '["http://localhost:5173", "http://localhost:3000"]';
      expect(getAllowedOrigins(input)).toEqual([
        'http://localhost:5173',
        'http://localhost:3000',
      ]);
    });

    it('should handle trailing/leading commas and empty elements', () => {
      const input = ',http://localhost:5173,,http://localhost:3000,';
      expect(getAllowedOrigins(input)).toEqual([
        'http://localhost:5173',
        'http://localhost:3000',
      ]);
    });

    it('should allow wildcard origin', () => {
      expect(getAllowedOrigins('*')).toEqual(['*']);
    });
  });

  describe('getCorsOptions callback', () => {
    it('should allow requests with no origin header (like curl or mobile apps)', () => {
      const options = getCorsOptions('http://localhost:5173,http://localhost:3000');
      let allowed: boolean | undefined;

      if (typeof options.origin === 'function') {
        options.origin(undefined as any, (err, result) => {
          expect(err).toBeNull();
          allowed = result as boolean;
        });
      }
      expect(allowed).toBe(true);
    });

    it('should allow any of the configured origins', () => {
      const options = getCorsOptions('http://localhost:5173, http://localhost:3000');

      if (typeof options.origin === 'function') {
        options.origin('http://localhost:5173', (err, result) => {
          expect(err).toBeNull();
          expect(result).toBe(true);
        });

        options.origin('http://localhost:3000', (err, result) => {
          expect(err).toBeNull();
          expect(result).toBe(true);
        });
      }
    });

    it('should reject unlisted origins', () => {
      const options = getCorsOptions('http://localhost:5173, http://localhost:3000');

      if (typeof options.origin === 'function') {
        options.origin('https://malicious-site.com', (err, result) => {
          expect(err).toBeNull();
          expect(result).toBe(false);
        });
      }
    });

    it('should allow all origins if wildcard * is configured', () => {
      const options = getCorsOptions('*');

      if (typeof options.origin === 'function') {
        options.origin('https://any-domain.com', (err, result) => {
          expect(err).toBeNull();
          expect(result).toBe(true);
        });
      }
    });
  });

  describe('Express CORS middleware integration', () => {
    const createTestApp = (corsOrigin: string) => {
      const app = express();
      app.use(cors(getCorsOptions(corsOrigin)));
      app.get('/test', (req, res) => res.json({ ok: true }));
      return app;
    };

    it('should set CORS headers for first allowed origin in multi-origin list', async () => {
      const app = createTestApp('http://localhost:5173, http://localhost:3000');

      const res = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should set CORS headers for second allowed origin in multi-origin list', async () => {
      const app = createTestApp('http://localhost:5173, http://localhost:3000');

      const res = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should NOT set access-control-allow-origin for unauthorized origin', async () => {
      const app = createTestApp('http://localhost:5173, http://localhost:3000');

      const res = await request(app)
        .get('/test')
        .set('Origin', 'http://unauthorized-origin.com');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should respond to OPTIONS preflight requests for allowed origins', async () => {
      const app = createTestApp('http://localhost:5173, http://localhost:3000');

      const res = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
    });

    it('should allow custom headers like x-benchmark-user-id during preflight', async () => {
      const app = createTestApp('http://localhost:5173, http://localhost:3000');

      const res = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'x-benchmark-user-id, content-type');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-headers']).toContain('x-benchmark-user-id');
    });
  });
});
