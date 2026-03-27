# Design Proposals & RFCs

Design proposals and Request for Comments for system improvements and new features.

## 📋 Proposals

### ETL & Scheduling

- **[ETL Scheduling Proposal](./ETL_SCHEDULING_PROPOSAL.md)**
  - Proposal for advanced ETL scheduling capabilities
  - Integration of APScheduler with data pipeline
  - Automated job orchestration and monitoring
  - Scalability and fault tolerance considerations

### User Crowdsourcing

- **[User Crowdsourcing Feature Proposal](./USER_CROWDSOURCING_FEATURE_PROPOSAL.md)**
  - User-facing News Feed for verified incidents within radius
  - Mobile-first Report Incident flow with optional image upload
  - Clerk-based authenticated reporting and moderation-ready lifecycle

### Incident Data Model & Moderation

- **[Incident Crowdsourcing Schema Proposal](./INCIDENT_CROWDSOURCING_SCHEMA_PROPOSAL.md)**
  - Schema extension for source/status/reporter/image/upvotes
  - Backward-compatible migration and indexing strategy
  - Authorization policy for ownership and admin moderation

## Status

All proposals in this directory have been reviewed and implementation decisions documented in corresponding implementation files.

See [data-pipeline/docs/](../../data-pipeline/docs/) for implementation guides and results.

---

**Purpose:** This directory maintains design proposals that shaped the Traffic IoC architecture and feature set.

**Last Updated:** 2026-03-24
