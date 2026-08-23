import mongoose from 'mongoose';
import { Logger } from '../utils/logger';

const logger = new Logger('MongooseConfig');

export async function connectMongoDB(): Promise<void> {
  const mongoUrl = process.env.DATABASE_CACHE_RESPONSE_URL;
  if (!mongoUrl) {
    logger.error('DATABASE_CACHE_RESPONSE_URL is not defined in environment variables');
    return;
  }

  try {
    await mongoose.connect(mongoUrl, {
      dbName: 'traffic-ioc-cache-response-db',
    });
    logger.log('✓ MongoDB connection successful to traffic-ioc-cache-response-db');
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error);
    throw error;
  }
}

export async function disconnectMongoDB(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.log('✓ MongoDB disconnected successfully');
  } catch (error) {
    logger.error('Error during MongoDB disconnection', error);
  }
}
