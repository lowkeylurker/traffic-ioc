# Tasks: Add User Crowdsourcing Incident Flow

## 1. Schema and Data Migration

- [x] 1.1 Confirm canonical incident table name and geometry column naming across environments.
- [x] 1.2 Add incident source and status enums required for crowdsourcing lifecycle.
- [x] 1.3 Add columns: source, status, reporter_id, image_url, upvotes (default 0).
- [x] 1.4 Backfill legacy rows with safe source/status defaults.
- [x] 1.5 Add indexes for status/time and spatial nearby queries.
- [ ] 1.6 Validate migration on staging snapshot with no data loss.

## 2. Backend API Delivery

- [x] 2.1 Implement GET /api/v1/user/news with lat/long/radius validation.
- [x] 2.2 Ensure news query returns only VERIFIED incidents in radius and newest first.
- [x] 2.3 Implement POST /api/v1/user/report as multipart/form-data.
- [x] 2.4 Enforce Clerk authentication and reporter ownership mapping.
- [x] 2.5 Integrate Cloudinary upload and persist image_url when upload succeeds.
- [x] 2.6 Return acknowledgement message for pending moderation.
- [x] 2.7 Add rate limiting and input validation (incident type, coordinates, file constraints).

## 3. Frontend UX Delivery

- [x] 3.1 Add News tab list cards with icon, road name, timestamp, and optional image.
- [x] 3.2 Add mobile-first reporting FAB and three-step report flow.
- [x] 3.3 Integrate navigator.geolocation and denial fallback UX.
- [x] 3.4 Implement pull-to-refresh and optional active-tab polling.
- [x] 3.5 Display post-submit success feedback: Cam on, bao cao dang cho duyet.

## 4. Moderation and Policy

- [x] 4.1 Define and enforce valid status transitions in admin workflows.
- [x] 4.2 Ensure users cannot modify incidents created by other users.
- [x] 4.3 Ensure moderation actions are admin-only.

## 5. Validation

- [x] 5.1 Add API tests for auth, validation, and filtering behavior.
- [x] 5.2 Add migration checks for row count consistency and defaults.
- [x] 5.3 Add integration test for report-with-image and report-without-image paths.
- [x] 5.4 Add feed tests for VERIFIED-only filtering and sort order.

## 6. Release Readiness

- [x] 6.1 Document environment variable requirements for media upload and auth.
- [x] 6.2 Define operational metrics and alerts for moderation and upload failures.
- [x] 6.3 Prepare rollback notes for migration and endpoint toggles.
