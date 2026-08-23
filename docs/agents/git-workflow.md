# Git & Contribution Workflow

## Branching Model
- **Main Branch**: `main` (Production/stable demo branch).
- **Feature Branches**: `feature/<module>/<feature-name>` (e.g., `feature/fe/incident-feed`, `feature/be/corridor-cache`).
- **Bugfix Branches**: `fix/<module>/<bug-name>`.

## Commit Message Format
`[SCOPE] <Action>: <Description>`
- **Scopes**: `[FE]`, `[BE]`, `[AI]`, `[DE]`, `[INFRA]`, `[DOCS]`
- **Examples**:
  - `[FE] Add: Incident impact buffer visualization layer`
  - `[BE] Fix: Redis connection reconnect backoff logic`
  - `[DE] Update: ETL script for weather hourly ingestion`
