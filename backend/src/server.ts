// Server Entry Point

import 'dotenv/config';
import { createApp } from './app';
import { Logger } from './utils/logger';
import { prisma } from './config/prisma';
import { closeRedisConnection } from './config/redis';
import { reliabilityJobService } from './services/reliability-job.service';

const logger = new Logger('Server');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function main() {
  try {
    // Kiểm tra kết nối Database
    logger.log('Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    logger.log('✓ Database connection successful');

    // Khởi tạo Express app
    const app = createApp();

    await reliabilityJobService.start();

    // Start server
    const server = app.listen(PORT, () => {
      logger.log(`
        ╔════════════════════════════════════════╗
        ║   Traffic IOC Backend Server           ║
        ║   Node.js + Express + Prisma           ║
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
      server.close(async () => {
        await reliabilityJobService.stop();
        await closeRedisConnection();
        await prisma.$disconnect();
        logger.log('✓ Server shut down successfully');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.log('SIGINT received, shutting down gracefully...');
      server.close(async () => {
        await reliabilityJobService.stop();
        await closeRedisConnection();
        await prisma.$disconnect();
        logger.log('✓ Server shut down successfully');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

main();
