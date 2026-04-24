// Express App Setup - Cấu hình Express server

import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { API_VERSIONS, ROUTE_PATHS } from './constants/messages';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { Logger } from './utils/logger';

// Routes
import { clerkMiddleware } from '@clerk/express';
import compression from 'compression';
import analyticsRoutes from './routes/analytics.routes';
import incidentRoutes from './routes/incident.routes';
import mapRoutes from './routes/map.routes';
import olapRoutes from './routes/olap.routes';
import newsRoutes from './routes/news.routes';
import searchRoutes from './routes/search.routes';
import simulationRoutes from './routes/simulation.routes';
import trafficRoutes from './routes/traffic.routes';
import userRoutes from './routes/user/user.routes';
import weatherRoutes from './routes/weather.routes';

const logger = new Logger('App');

export const createApp = (): Express => {
  const app = express();

  // ============================================================================
  // Middleware
  app.use(clerkMiddleware());
  // ============================================================================

  // Security & Compression
  app.use(helmet());
  app.use(compression());

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

  // Alias without version for BI/OLAP compatibility
  app.use('/api/olap', olapRoutes);
  app.use('/api/traffic', trafficRoutes);
  app.use('/api/search', searchRoutes);

  app.use(`${apiV1}${ROUTE_PATHS.MAP}`, mapRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.TRAFFIC}`, trafficRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.SEARCH}`, searchRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.ANALYTICS}`, analyticsRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.OLAP}`, olapRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.SIMULATION}`, simulationRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.INCIDENT}`, incidentRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.WEATHER}`, weatherRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.USER}`, userRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.NEWS}`, newsRoutes);

  logger.log('Routes registered:', {
    map: `${apiV1}${ROUTE_PATHS.MAP}`,
    traffic: `${apiV1}${ROUTE_PATHS.TRAFFIC}`,
    search: `${apiV1}${ROUTE_PATHS.SEARCH}`,
    analytics: `${apiV1}${ROUTE_PATHS.ANALYTICS}`,
    olap: `${apiV1}${ROUTE_PATHS.OLAP}`,
    simulation: `${apiV1}${ROUTE_PATHS.SIMULATION}`,
    incident: `${apiV1}${ROUTE_PATHS.INCIDENT}`,
    weather: `${apiV1}${ROUTE_PATHS.WEATHER}`,
    user: `${apiV1}${ROUTE_PATHS.USER}`,
    news: `${apiV1}${ROUTE_PATHS.NEWS}`,
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
