# Smart Traffic IOC — Agent Guide

Smart Traffic IOC is an urban intelligent operations center platform providing real-time traffic monitoring, incident crowdsourcing, OLAP reliability analytics, and routing simulation for Ho Chi Minh City.

## Quick Commands & Scripts

- **Monorepo Subsystems (pnpm + Turborepo)**:
  - Root: `pnpm dev`, `pnpm build`, `pnpm build:check`, `pnpm lint`
  - `apps/admin-web/`: React 18, Vite, AntD (`pnpm dev:admin` or `pnpm --filter=@traffic-ioc/admin-web dev`)
  - `apps/user-web/`: Next.js (App Router), React 19, Tailwind CSS (`pnpm dev:user` or `pnpm --filter=@traffic-ioc/user-web dev`)
  - `apps/backend/`: Express.js, TypeScript, Prisma (`pnpm dev:backend` or `pnpm --filter=@traffic-ioc/backend dev`)
  - `rag-ingestion/`: Python 3.11+, FastAPI, LlamaIndex, Qdrant, Ollama (`pnpm dev:rag` or `cd rag-ingestion && uv run uvicorn src.main:app --host 0.0.0.0 --port 8001 --reload`)
  - `packages/shared/`: Shared domain models, constants, Zod schemas, and utilities
  - `packages/shared-config/`: Shared tsconfig & lint configs
  - `data-pipeline/` & `ai-core/`: Python 3.10+ (`requirements.txt`)
- **Python Formatting, Linting & Docstrings (`rag-ingestion/`)**:
  - Always run `uv run ruff format .`, `uv run ruff check --fix .`, and `uv run pyrefly check` after modifying code in `rag-ingestion/`.
  - Always provide comprehensive Google/Sphinx style docstrings on all classes and functions (documenting `Args:`, `Returns:`, `Raises:`).
  - Use MinIO object storage references (`storage_key` / `doc_id`) for document binaries instead of base64 JSON payloads.
- **Database Schema**:
  - Run `pnpm prisma:gen` from root (or `npx prisma generate` in `apps/backend/`).

## Progressive Disclosure & Detailed Guides

Refer to domain-specific instructions when working on specialized tasks:

- **[RAG Legislation Ingestion Guide](file:///home/levion/Documents/project/traffic-ioc/rag-ingestion/AGENTS.md)**: Python FastAPI, LlamaIndex AST parsing, Ruff formatting/linting rules, and Redis Pub/Sub events.
- **[Citizen User Web Portal Guide](file:///home/levion/Documents/project/traffic-ioc/apps/user-web/AGENTS.md)**: Next.js App Router, Tailwind CSS, crowdsourcing incident submission, and location news feed.
- **[TypeScript & Frontend Conventions](file:///home/levion/Documents/project/traffic-ioc/docs/agents/typescript-conventions.md)**: Component design, Zustand state management, and Web Worker offloading.
- **[Database & Geospatial Strategy](file:///home/levion/Documents/project/traffic-ioc/docs/agents/database-conventions.md)**: Prisma ORM vs. raw PostGIS SQL pool usage, naming conventions, and spatial indexing.
- **[API & Backend Architecture](file:///home/levion/Documents/project/traffic-ioc/docs/agents/api-design.md)**: Endpoint structure, camelCase JSON formatting, and error middleware.
- **[Git & Commit Workflow](file:///home/levion/Documents/project/traffic-ioc/docs/agents/git-workflow.md)**: Branching patterns (`feature/<module>/...`) and scoped commit messages (`[FE]`, `[BE]`).
- **[OpenSpec Change Workflow](file:///home/levion/Documents/project/traffic-ioc/docs/agents/openspec-workflow.md)**: Rules for proposing, applying, and archiving changes.
