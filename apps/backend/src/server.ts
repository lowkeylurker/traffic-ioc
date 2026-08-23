// Server Entry Point

import 'dotenv/config';
import { createApp } from './app';
import { prisma } from './config/prisma';
import pgPool from './config/db';
import { closeRedisConnection } from './config/redis';
import { olapJobService } from './jobs/olap-job.service';
import { reliabilityJobService } from './jobs/reliability-job.service';
import { routingRefreshJobService } from './jobs/routing-refresh-job.service';
import { corridorAnalyticsJobService } from './jobs/corridor-analytics-job.service';
import { Logger } from './utils/logger';
import { clearTrafficNewsQueueOnStartup, scheduleTrafficNewsJob } from './jobs/newsQueue';
import { connectMongoDB, disconnectMongoDB } from './config/mongoose';
import { trafficNewsWorker } from './jobs/trafficNewsWorker';
import { trafficMVRefreshJobService } from './jobs/traffic-mv-refresh.service';

const logger = new Logger('Server');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

type HttpServerWithCloseAll = import('http').Server & {
  closeAllConnections?: () => void;
  closeIdleConnections?: () => void;
};

function closeHttpServer(server: HttpServerWithCloseAll): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    server.close((error) => {
      if (error) {
        logger.error('Error while closing HTTP server', error);
      }
      done();
    });

    server.closeIdleConnections?.();
    setTimeout(() => {
      server.closeAllConnections?.();
      done();
    }, 5000).unref();
  });
}

async function runShutdownTask(name: string, task: () => Promise<void>, timeoutMs = 5000): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      task(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          logger.warn(name + ' shutdown timed out after ' + timeoutMs + 'ms');
          resolve();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function shutdownServer(server: HttpServerWithCloseAll, csvExportWorker?: { close: () => Promise<void> }) {
  await closeHttpServer(server);
  await runShutdownTask('OLAP job service', () => olapJobService.stop());
  await runShutdownTask('traffic news worker', () => trafficNewsWorker.close());
  if (csvExportWorker) {
    await runShutdownTask('CSV export worker', () => csvExportWorker.close());
  }
  await runShutdownTask('reliability job service', () => reliabilityJobService.stop());
  await runShutdownTask('routing refresh job service', () => routingRefreshJobService.stop());
  await runShutdownTask('corridor analytics job service', () => corridorAnalyticsJobService.stop());
  await runShutdownTask('traffic MV refresh job service', () => trafficMVRefreshJobService.stop());
  await runShutdownTask('MongoDB', () => disconnectMongoDB());
  await runShutdownTask('Redis', () => closeRedisConnection());
  await runShutdownTask('PostgreSQL pool', () => pgPool.end());
  await runShutdownTask('Prisma', () => prisma.$disconnect());
  logger.log('✓ Server shut down successfully');
  process.exit(0);
}

async function main() {
  try {
    // Kiểm tra kết nối Database
    logger.log('Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    logger.log('✓ Database connection successful');

    // Kết nối MongoDB
    await connectMongoDB();

    // Khởi tạo Express app
    const app = createApp();

    // Tạo HTTP Server và tích hợp Socket.io Server
    const { createServer } = await import('http');
    const { Server } = await import('socket.io');
    const { socketService } = await import('./services/socket.service');

    const httpServer = createServer(app);
    const io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        credentials: true,
      },
    });

    // Setup Socket.io Gateway
    socketService.setupSocketGateway(io);

    // Kích hoạt Worker BullMQ của CSV Export lắng nghe job nền
    const { csvExportWorker } = await import('./jobs/csvExportWorker');

    await olapJobService.start();
    await reliabilityJobService.start();
    await routingRefreshJobService.start();
    await corridorAnalyticsJobService.start();
    await trafficMVRefreshJobService.start();

    // Khởi tạo News Ticker Job
    await clearTrafficNewsQueueOnStartup();
    await scheduleTrafficNewsJob();

    // Start server
    const server = httpServer.listen(PORT, () => {
      logger.log(`
        ╔════════════════════════════════════════╗
        ║   Traffic IOC Backend Server           ║
        ║   Node.js + Express + Prisma + Socket  ║
        ╠════════════════════════════════════════╣
        ║ 🚀 Server running on port ${PORT}        ║
        ║ 🔧 Environment: ${NODE_ENV.padEnd(29)} ║
        ║ 📍 API: http://localhost:${PORT}/api/v1 ║
        ║ 💓 Health: http://localhost:${PORT}/health ║
        ╚════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.log('SIGTERM received, shutting down gracefully...');
      void shutdownServer(server, csvExportWorker);
    });

    process.on('SIGINT', () => {
      logger.log('SIGINT received, shutting down gracefully...');
      void shutdownServer(server, csvExportWorker);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    await pgPool.end().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }
}

main();
