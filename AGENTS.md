# Smart Traffic IOC — Agent Guide

Smart Traffic IOC is an urban intelligent operations center platform providing real-time traffic monitoring, incident crowdsourcing, OLAP reliability analytics, and routing simulation for Ho Chi Minh City.

## Quick Commands & Scripts

- **Monorepo Subsystems**:
  - `frontend/`: React 18, Vite (`npm run dev`, `npm run build:check`, `npm run lint`)
  - `backend/`: Express.js, TypeScript, Prisma (`npm run dev`, `npm run build`, `npm run prisma:gen`)
  - `data-pipeline/` & `ai-core/`: Python 3.10+ (`requirements.txt`)
- **Database Schema**:
  - Run `npx prisma generate` in `backend/` after modifying `schema.prisma`.

## Progressive Disclosure & Detailed Guides

Refer to domain-specific instructions when working on specialized tasks:

- **[TypeScript & Frontend Conventions](file:///home/levion/Documents/project/traffic-ioc/docs/agents/typescript-conventions.md)**: Component design, Zustand state management, and Web Worker offloading.
- **[Database & Geospatial Strategy](file:///home/levion/Documents/project/traffic-ioc/docs/agents/database-conventions.md)**: Prisma ORM vs. raw PostGIS SQL pool usage, naming conventions, and spatial indexing.
- **[API & Backend Architecture](file:///home/levion/Documents/project/traffic-ioc/docs/agents/api-design.md)**: Endpoint structure, camelCase JSON formatting, and error middleware.
- **[Git & Commit Workflow](file:///home/levion/Documents/project/traffic-ioc/docs/agents/git-workflow.md)**: Branching patterns (`feature/<module>/...`) and scoped commit messages (`[FE]`, `[BE]`).
- **[OpenSpec Change Workflow](file:///home/levion/Documents/project/traffic-ioc/docs/agents/openspec-workflow.md)**: Rules for proposing, applying, and archiving changes.
