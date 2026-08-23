# Database & Geospatial Conventions

## Dual-Engine Database Strategy
- **Prisma ORM (`backend/prisma/schema.prisma`)**:
  - Used for schema definition, migrations, model relations, and standard CRUD.
- **Raw SQL Pool (`backend/src/config/db.ts`)**:
  - Used for high-throughput spatial queries, PostGIS functions (`ST_AsGeoJSON`, `ST_DWithin`, `ST_Buffer`), and partitioned fact table operations where Prisma performance is limited.

## Schema Naming Rules
- **Tables**: `snake_case`, singular (e.g., `dim_segment`, `fact_traffic_flow`, `bridge_corridor_segment`).
- **Columns**: `snake_case` (e.g., `current_speed_kmh`, `recorded_at`).
- **Indices**: Spatial indices must use GIST (`@@index([geometry], type: Gist)`), temporal partitions use BRIN.
