import { prisma } from '../config/prisma';
import { Logger } from '../utils/logger';

const logger = new Logger('SetupOptimizations');

async function main() {
  try {
    logger.log('Starting optimization setup...');

    // 1. Create Materialized View for latest traffic status
    logger.log('Dropping existing view if any...');
    await prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS mv_latest_traffic_status CASCADE`);
    
    logger.log('Creating mv_latest_traffic_status...');
    await prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW mv_latest_traffic_status AS
      SELECT DISTINCT ON (f.segment_key)
        f.segment_key, 
        f.current_speed_kmh, 
        f.los_level, 
        f.traffic_index, 
        f.pcu_volume, 
        f.timestamp,
        COALESCE(r.name, s.segment_id_source::text) AS segment_name,
        r.road_key::text AS road_key,
        EXISTS (
          SELECT 1 FROM bridge_corridor_segment bcs WHERE bcs.segment_key = f.segment_key
        ) AS is_corridor,
        ST_Transform(s.geometry_linestring, 3857) AS geom_3857
      FROM fact_traffic_flow f
      JOIN dim_segment s ON f.segment_key = s.segment_key
      LEFT JOIN dim_way w ON s.way_key = w.way_key
      LEFT JOIN dim_road r ON w.road_key = r.road_key
      WHERE f.timestamp >= NOW() - INTERVAL '15 minutes'
      ORDER BY f.segment_key, f.timestamp DESC
    `);

    // 2. Create index on the view
    logger.log('Creating indexes on mv_latest_traffic_status...');
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX idx_mv_latest_traffic_segment ON mv_latest_traffic_status (segment_key)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX idx_mv_latest_traffic_geom ON mv_latest_traffic_status USING GIST (geom_3857)
    `);

    // 3. Create a function to refresh the view
    logger.log('Creating refresh function...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION refresh_latest_traffic_status()
      RETURNS void AS $$
      BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_latest_traffic_status;
      END;
      $$ LANGUAGE plpgsql
    `);

    logger.log('✓ Optimization setup successful');
  } catch (error) {
    logger.error('Failed to setup optimizations', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
