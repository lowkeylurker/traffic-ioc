// Express App Setup - Cấu hình Express server

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { API_VERSIONS, ROUTE_PATHS } from './constants/messages';
import { Logger } from './utils/logger';

// Routes
import mapRoutes from './routes/map.routes';
import analyticsRoutes from './routes/analytics.routes';
import simulationRoutes from './routes/simulation.routes';
import weatherRoutes from './routes/weather.routes';
import { clerkMiddleware } from '@clerk/express';

const logger = new Logger('App');

export const createApp = (): Express => {
  const app = express();

  // ============================================================================
  // Middleware
  app.use(clerkMiddleware());
  // ============================================================================

  // Security
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Logging
  app.use(morgan('combined'));

  // ============================================================================
  // Health Check
  // ============================================================================
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // ============================================================================
  // API Routes
  // ============================================================================
  const apiV1 = `${API_VERSIONS.V1}`;

  app.use(`${apiV1}${ROUTE_PATHS.MAP}`, mapRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.ANALYTICS}`, analyticsRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.SIMULATION}`, simulationRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.WEATHER}`, weatherRoutes);

  logger.log('Routes registered:', {
    map: `${apiV1}${ROUTE_PATHS.MAP}`,
    analytics: `${apiV1}${ROUTE_PATHS.ANALYTICS}`,
    simulation: `${apiV1}${ROUTE_PATHS.SIMULATION}`,
    weather: `${apiV1}${ROUTE_PATHS.WEATHER}`,
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (phải đặt ở cuối)
  app.use(errorHandler);

  return app;
};
