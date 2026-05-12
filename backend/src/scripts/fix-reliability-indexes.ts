import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoUrl = process.env.DATABASE_CACHE_RESPONSE_URL;
const dbName = 'traffic-ioc-cache-response-db';

async function fixIndexes() {
  if (!mongoUrl) {
    console.error('DATABASE_CACHE_RESPONSE_URL not found in .env');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB (DB: ${dbName})...`);
  await mongoose.connect(mongoUrl, { dbName });
  
  const db = mongoose.connection.db;
  if (!db) {
    console.error('Database connection failed.');
    process.exit(1);
  }

  const collection = db.collection('corridor-reliability-cache');
  
  console.log('Fetching indexes...');
  try {
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    const oldIndexName = 'timeWindow_1_corridorKey_1';
    const hasOldIndex = indexes.some(idx => idx.name === oldIndexName);

    if (hasOldIndex) {
      console.log(`Dropping old index: ${oldIndexName}...`);
      await collection.dropIndex(oldIndexName);
      console.log('✓ Old index dropped.');
    } else {
      console.log('Old index not found.');
    }
  } catch (e: any) {
    if (e.code === 26) {
      console.log('Collection not found, no indexes to drop.');
    } else {
      throw e;
    }
  }

  console.log('Disconnecting...');
  await mongoose.disconnect();
  console.log('Done.');
}

fixIndexes().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
