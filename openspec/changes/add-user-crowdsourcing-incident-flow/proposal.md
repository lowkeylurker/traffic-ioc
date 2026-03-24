# Change Proposal: Add User Crowdsourcing Incident Flow

## Why

Traffic IOC currently focuses on system/admin-generated incidents and lacks a complete user crowdsourcing path. Users cannot quickly report incidents from their current location with evidence, and there is no dedicated nearby verified feed optimized for mobile usage.

This change introduces a minimal, moderation-safe crowdsourcing flow:

- User News Feed for verified incidents within 5 km.
- Authenticated user report submission with optional image.
- Incident schema expansion for source, moderation status, ownership, and image URL.

## What Changes

1. Add user-facing News Feed capability:

- New endpoint for nearby verified incidents.
- Mobile-first list cards with incident icon, road name, timestamp, and optional image.
- Pull-to-refresh and optional lightweight polling.

2. Add user incident reporting capability:

- New authenticated multipart endpoint for report submission.
- Geolocation-backed payload with incident type and optional image.
- Cloudinary upload support and pending moderation acknowledgement.

3. Expand incident data model for crowdsourcing and moderation:

- Add source/status/reporter_id/image_url/upvotes fields.
- Introduce controlled status transitions and ownership rules.
- Enforce verified-only filtering for user news feed.

## Scope

- Included:
- API contracts for user news and user report submission.
- Data model requirements and moderation state model.
- Mobile/Web UX behavior requirements.
- Security and validation requirements at API layer.

- Excluded:
- Full social interactions (comments/shares).
- Reputation/trust ML scoring.
- Complex push architecture beyond polling/pull-to-refresh MVP.

## Impact

- Backend: New user endpoints, auth checks, upload integration, moderation constraints.
- Database: Schema migration and indexing updates for crowdsourcing attributes.
- Frontend: New News tab, reporting FAB flow, location and image handling.
- Operations: Additional monitoring for upload failures, moderation throughput, and pending queue size.

## Risks and Mitigation

- Spam from user reports: Require Clerk auth, rate limiting, and moderation gate.
- Incorrect geolocation: Add client fallback and user confirmation before submit.
- Upload instability: Allow report submission without image and return actionable errors.
- Query performance regression: Add proper B-tree/GiST indexes and verify query plans.

## Rollout Plan

1. Data migration and compatibility checks.
2. Backend endpoint delivery (news and report) with validation/auth.
3. Frontend mobile-first UX delivery for feed and report flow.
4. Verification workflow and refresh mechanism tuning.

## Open Questions

- Should non-authenticated users be allowed to read News Feed in MVP?
- Should radius be fixed to 5 km or configurable by user in MVP?
- Is polling interval 30s or 60s the default for low-end devices?
