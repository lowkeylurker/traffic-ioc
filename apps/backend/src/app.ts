// Express App Setup - Cấu hình Express server

import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { API_VERSIONS, ROUTE_PATHS } from './constants/messages';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { Logger } from './utils/logger';

// Routes
import { clerkMiddleware } from '@clerk/express';
import compression from 'compression';
import analyticsRoutes from './routes/analytics.routes';
import historyRoutes from './routes/history.routes';
import incidentRoutes from './routes/incident.routes';
import mapRoutes from './routes/map.routes';
import olapRoutes from './routes/olap.routes';
import newsRoutes from './routes/news.routes';
import searchRoutes from './routes/search.routes';
import simulationRoutes from './routes/simulation.routes';
import trafficRoutes from './routes/traffic.routes';
import userRoutes from './routes/user/user.routes';
import weatherRoutes from './routes/weather.routes';
import ragRoutes from './routes/rag.routes';

const logger = new Logger('App');

export const createApp = (): Express => {
  const app = express();

  // Initialize Sentry
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [
        nodeProfilingIntegration(),
      ],
      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,
    });
  }

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
  const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(
    morgan(morganFormat, {
      stream: {
        write: (message: string) => logger.http(message.trim()),
      },
    })
  );

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
  app.use('/api/history', historyRoutes);
  app.use('/api/traffic', trafficRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/rag', ragRoutes);

  app.use(`${apiV1}${ROUTE_PATHS.MAP}`, mapRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.TRAFFIC}`, trafficRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.SEARCH}`, searchRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.ANALYTICS}`, analyticsRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.HISTORY}`, historyRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.OLAP}`, olapRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.SIMULATION}`, simulationRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.INCIDENT}`, incidentRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.WEATHER}`, weatherRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.USER}`, userRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.NEWS}`, newsRoutes);
  app.use(`${apiV1}${ROUTE_PATHS.RAG}`, ragRoutes);

  logger.log('Routes registered:', {
    map: `${apiV1}${ROUTE_PATHS.MAP}`,
    traffic: `${apiV1}${ROUTE_PATHS.TRAFFIC}`,
    search: `${apiV1}${ROUTE_PATHS.SEARCH}`,
    analytics: `${apiV1}${ROUTE_PATHS.ANALYTICS}`,
    history: `${apiV1}${ROUTE_PATHS.HISTORY}`,
    olap: `${apiV1}${ROUTE_PATHS.OLAP}`,
    simulation: `${apiV1}${ROUTE_PATHS.SIMULATION}`,
    incident: `${apiV1}${ROUTE_PATHS.INCIDENT}`,
    weather: `${apiV1}${ROUTE_PATHS.WEATHER}`,
    user: `${apiV1}${ROUTE_PATHS.USER}`,
    news: `${apiV1}${ROUTE_PATHS.NEWS}`,
    rag: `${apiV1}${ROUTE_PATHS.RAG}`,
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  // The error handler must be before any other error middleware and after all controllers
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (phải đặt ở cuối)
  app.use(errorHandler);

  return app;
};
