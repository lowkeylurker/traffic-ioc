import { Request, Response } from 'express';
import { query } from '../config/db';
import { Logger } from '../utils/logger';

const logger = new Logger('TileController');

class TileController {
  /**
   * Get Vector Tile (MVT) for traffic segments
   */
  async getTrafficTiles(req: Request, res: Response) {
    const { z, x, y } = req.params;
    const zoom = parseInt(z);
    const tileX = parseInt(x);
    const tileY = parseInt(y);

    try {
      // Calculate BBox for the tile
      // Use ST_TileEnvelope for PostGIS 3.0+
      const sql = `
        WITH 
        bounds AS (
          SELECT ST_TileEnvelope($1, $2, $3) AS geom
        ),
        mvt_geom AS (
          SELECT 
            f.segment_key::text    AS "segmentId",
            f.segment_name         AS "segmentName",
            f.current_speed_kmh    AS "avgSpeed",
            f.los_level            AS "losGrade",
            f.traffic_index        AS "losScore",
            f.is_corridor          AS "isCorridor",
            f.road_key             AS "roadKey",
            f.road_name            AS "roadName",
            f.timestamp::text      AS "timestamp",
            ST_AsMVTGeom(
              f.geom_3857, 
              bounds.geom, 
              4096, 
              64, 
              true
            ) AS geom
          FROM mv_latest_traffic_status f
          JOIN bounds ON f.geom_3857 && bounds.geom
        )
        SELECT ST_AsMVT(mvt_geom.*, 'traffic_segments') AS mvt FROM mvt_geom;
      `;

      const result = await query(sql, [zoom, tileX, tileY]);
      
      if (result.rows.length > 0 && result.rows[0].mvt) {
        logger.debug(`Tile ${z}/${x}/${y} generated, size: ${result.rows[0].mvt.length} bytes`);
        res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
        res.send(result.rows[0].mvt);
      } else {
        logger.debug(`Tile ${z}/${x}/${y} is empty`);
        res.status(204).end();
      }
    } catch (error) {
      logger.error(`Error generating tile ${z}/${x}/${y}`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const tileController = new TileController();
