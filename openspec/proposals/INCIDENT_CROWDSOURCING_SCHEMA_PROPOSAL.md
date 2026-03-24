# Proposal: Incident Schema Expansion for Crowdsourcing and Moderation

## 1. Current State

Incident records do not fully support user-generated submissions with moderation lifecycle and evidence image links.

As a result:

- Source provenance is incomplete.
- Moderation status is not first-class for all incident records.
- User ownership and image evidence handling are limited.

## 2. Goals

- Expand incident schema for user report ingestion.
- Track source and status explicitly.
- Preserve backward compatibility with existing incident data.
- Enable verified-only News Feed queries and moderation workflows.

## 3. Non-Goals

- Full trust/reputation scoring system in this phase.
- Distributed media pipeline optimization at scale.
- Geo-clustering and dedup intelligence in DB layer (phase 2+).

## 4. Proposed Schema Changes

Target table: fact_incidents (or fact_incident, aligned with actual DB naming)

### 4.1 New Columns

- source: enum (SENSOR, ADMIN, USER_REPORT)
- status: enum (PENDING, VERIFIED, REJECTED, RESOLVED)
- reporter_id: text/varchar (nullable for SENSOR/ADMIN records)
- image_url: text (nullable)
- upvotes: int not null default 0

### 4.2 Migration Safety

- Add enums first (if not existing).
- Add columns with safe defaults/nullability.
- Backfill existing rows:
  - source: SENSOR or ADMIN based on existing lineage rules.
  - status: VERIFIED for legacy trusted records (team decision).
- Avoid destructive changes and table rewrites when possible.

## 5. Sample Migration Plan

- Step 1: create enum incident_source and incident_status.
- Step 2: alter table add columns.
- Step 3: backfill source/status for legacy data.
- Step 4: set constraints/defaults.
- Step 5: create indexes.

## 6. Query and Indexing Strategy

### 6.1 News Feed Query Rule

- Filter: status = VERIFIED
- Geo filter: within 5km from user location
- Sort: newest first (occurred_at desc, created_at desc fallback)

### 6.2 Index Recommendations

- btree on status, occurred_at desc
- btree on source, status
- btree on reporter_id
- gist on geometry/location column for spatial filtering
- optional partial index where status = VERIFIED

## 7. Storage Strategy for Images

- Upload file to Cloudinary (preferred MVP) or S3/local fallback.
- Persist public URL in image_url column.
- Do not store image binary blobs in PostgreSQL for this use case.

## 8. Security and Authorization Policy

If no Row Level Security is used, enforce at API service layer:

- User can create own reports.
- User can update/delete only records where reporter_id = current user id and status is still PENDING (policy choice).
- User cannot update reports created by others.
- Admin role can transition status: PENDING -> VERIFIED/REJECTED/RESOLVED.

Recommended status transition guardrails:

- PENDING -> VERIFIED
- PENDING -> REJECTED
- VERIFIED -> RESOLVED
- Reject invalid transitions server-side.

## 9. Backward Compatibility

- Existing sensor/admin records remain queryable.
- Legacy rows receive default source/status via backfill.
- Existing consumers not using new columns continue to function.

## 10. Operational Considerations

- Add metrics: pending count, verify rate, reject rate, upload failure rate.
- Add moderation audit logs (who changed status and when).
- Add cleanup policy for orphan images when DB insert fails after upload.

## 11. Test Plan

### 11.1 Migration Tests

- Migration executes successfully on staging snapshot.
- No data loss and row counts unchanged.

### 11.2 Data Integrity Tests

- Insert USER_REPORT with PENDING status succeeds.
- Insert SENSOR/ADMIN rows remain valid.
- upvotes defaults to 0.

### 11.3 Query Tests

- News feed query returns only VERIFIED incidents.
- Sort order by newest first is correct.
- Spatial radius filter (5km) returns expected records.

### 11.4 Security Tests

- Unauthorized user cannot submit (if auth required at endpoint).
- User cannot modify another user's report.
- Admin can verify/reject/resolve.

## 12. Acceptance Checklist

- Migration runs without losing legacy data.
- USER_REPORT record can be inserted with status PENDING.
- VERIFIED-only feed query works and sorts correctly.
- Image URL persists correctly when upload succeeds.
- Ownership and moderation authorization rules are enforced.

## 13. Rollout by Phase

- Phase 1: Schema migration + backfill + indexes.
- Phase 2: Report API integration + image upload + moderation endpoints.
- Phase 3: FE integration and production hardening (metrics, cleanup jobs).

## 14. Open Questions

- Canonical table name mismatch: fact_incident vs fact_incidents in environments?
- Should rejected records be immutable for users?
- Should upvotes be exposed in MVP API or hidden until phase 2?
