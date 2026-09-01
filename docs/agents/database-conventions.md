# Database & Geospatial Conventions

## Dual-Engine & Multi-Schema Database Strategy
- **OLTP Schema (`apps/backend/prisma/oltp.prisma`)**:
  - Code-First transactional schema (`OLTP_DATABASE_URL`).
  - Used for application models, RAG metadata (`knowledge_*`), chat history (`chat_*`), feedback, and user incidents.
  - Managed via Prisma Migrate (`pnpm prisma:migrate:oltp`).
- **DW Schema (`apps/backend/prisma/dw.prisma`)**:
  - SQL-First analytics & Data Warehouse schema (`DW_DATABASE_URL`).
  - Used for fact/dimension tables (`dim_*`, `fact_*`), PostGIS extensions, and OLAP queries.
  - Managed via Data Engineering DDL scripts; synchronized via Prisma Introspection (`pnpm prisma:pull:dw`).
- **Raw SQL Pool (`apps/backend/src/config/db.ts`)**:
  - PostgreSQL connection pool targeting DW (`DW_DATABASE_URL`).
  - Used for high-throughput spatial queries, PostGIS functions (`ST_AsGeoJSON`, `ST_DWithin`, `ST_Buffer`), and partitioned fact table operations.

## Schema Naming Rules
- **Tables**: `snake_case`, singular (e.g., `dim_segment`, `fact_traffic_flow`, `bridge_corridor_segment`).
- **Columns**: `snake_case` (e.g., `current_speed_kmh`, `recorded_at`).
- **Indices**: Spatial indices must use GIST (`@@index([geometry], type: Gist)`), temporal partitions use BRIN.
