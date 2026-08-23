# Design: User Crowdsourcing Incident Flow

## Overview

This design introduces a moderation-first crowdsourcing pipeline from user submission to public visibility:

- Submit path: User -> API -> media upload -> DB insert as PENDING.
- Moderation path: Admin transitions status.
- Consumption path: User News Feed shows VERIFIED items within radius.

The approach is intentionally minimal for MVP and keeps implementation straightforward.

## Architecture

### 1. Client Side (Mobile/Web)

- News tab requests nearby incidents using current geolocation.
- Report flow launched by FAB with three quick steps:
  - select type,
  - optional image,
  - submit.
- Pull-to-refresh is mandatory. Polling is optional but recommended on active tab.

### 2. API Layer

- GET /api/v1/user/news:
  - validates lat/long and radius,
  - queries verified incidents within radius,
  - returns sorted cards.
- POST /api/v1/user/report:
  - enforces Clerk auth,
  - validates incident payload and optional image,
  - uploads image to Cloudinary if provided,
  - inserts row with source USER_REPORT and status PENDING.

### 3. Data Layer

- Extend incident table with:
  - source, status, reporter_id, image_url, upvotes.
- Maintain ownership and moderation semantics in API policy.
- Use indexes for status/time and spatial filtering.

## Data Model and State

### Incident Source

- SENSOR
- ADMIN
- USER_REPORT

### Incident Status

- PENDING
- VERIFIED
- REJECTED
- RESOLVED

### Transition Rules (MVP)

- PENDING -> VERIFIED
- PENDING -> REJECTED
- VERIFIED -> RESOLVED
- All other transitions are rejected.

## Security and Authorization

- Submit endpoint requires authenticated user token.
- reporter_id is taken from auth subject, never from client input.
- User update/delete permissions (if provided later) are restricted to own records and pending state.
- Moderation transitions are admin-only.

## Storage Strategy

- Use Cloudinary as primary media target.
- Persist image_url only (no binary in DB).
- Handle upload failure with clear API error and no partial persistence.

## Refresh Strategy

- Required: pull-to-refresh.
- Recommended MVP: polling every 30-60 seconds while News tab is active.
- Future option: SSE/WebSocket if operations require lower latency.

## Trade-offs

1. Polling vs push:

- Polling is easier to ship and maintain in MVP.
- Push gives lower latency but increases complexity.

2. API policy vs RLS:

- API policy is faster to introduce in existing stack.
- RLS can be considered later for stronger DB-side enforcement.

3. Fixed radius vs configurable radius:

- Fixed 5 km simplifies UX and backend query tuning.
- Configurable radius can be added after baseline performance validation.

## Validation and Observability

- Validate request payloads, MIME types, and coordinate bounds.
- Track metrics:
  - report submissions,
  - upload failure rate,
  - pending queue size,
  - moderation throughput,
  - news query latency.
