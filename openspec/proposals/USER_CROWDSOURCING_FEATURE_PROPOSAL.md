# Proposal: User Crowdsourcing Features (News Feed + Report Incident)

## 1. Problem Statement

Current incident data is mostly system-generated (sensor/admin sources). End users cannot quickly report road incidents from the field, and there is no dedicated user-facing feed for verified incidents near their current location.

This creates 3 gaps:

- Slow detection for hyper-local incidents.
- Limited community participation in incident discovery.
- No mobile-first user loop for report -> moderation -> public visibility.

## 2. Goals

- Provide a mobile-first News Feed showing verified incidents within a radius from user location.
- Provide a fast incident report flow with optional image upload.
- Require authenticated identity (Clerk) for report submission.
- Support near real-time visibility after admin verification (auto refresh or pull-to-refresh).

## 3. Non-Goals

- Full social features (commenting, sharing, threaded discussion).
- Complex trust scoring and anti-fraud ML in phase 1.
- Offline-first sync and background upload in phase 1.

## 4. User Stories

- As a road user, I can open a News tab and see verified incidents near me.
- As a road user, I can quickly submit an incident with my location and optional photo.
- As a road user, I receive clear feedback after submission: "Cam on, bao cao dang cho duyet".
- As an admin, I can verify or reject user reports and then they appear (or not) in user feed.

## 5. Scope

### 5.1 Frontend (Mobile/Web)

- Add News tab in user app with list-card UI.
- Add floating action button (FAB) for report flow.
- Use navigator.geolocation for auto location retrieval.
- Support image input via native file input (MVP) and camera capture if available.
- Add pull-to-refresh and optional periodic refresh.

### 5.2 Backend API

- GET /api/v1/user/news?lat=...&long=...&radius=5km
- POST /api/v1/user/report (multipart/form-data)
- Upload image to Cloudinary, persist image URL in DB.
- Enforce Clerk-authenticated submit flow.

## 6. UX Flow (Mobile First)

### 6.1 News Feed

- Open app -> News tab.
- Location permission prompt.
- Show cards with:
  - Incident icon (accident/flood/congestion)
  - Road name
  - Time
  - Image thumbnail if present
- Pull down to refresh.

### 6.2 Report Flow

- Tap FAB Bao cao.
- Step 1: select type (Tai nan / Ngap / Tac).
- Step 2: optional image capture/upload.
- Step 3: confirm and submit.
- Success toast/banner: "Cam on, bao cao dang cho duyet".

## 7. API Design

### 7.1 GET News

- Endpoint: /api/v1/user/news
- Query:
  - lat: number (required)
  - long: number (required)
  - radius: string (optional, default 5km)
- Response 200 example:
  - items: array
    - incidentId
    - incidentType
    - roadName
    - occurredAt
    - imageUrl
    - distanceKm
    - location

### 7.2 POST Report

- Endpoint: /api/v1/user/report
- Auth: Clerk JWT required.
- Content-Type: multipart/form-data
- Fields:
  - incidentType (required)
  - lat (required)
  - long (required)
  - description (optional)
  - image (optional file)
- Response 201 example:
  - reportId
  - status: PENDING
  - message: Cam on, bao cao dang cho duyet

## 8. Validation and Security

- Reject unauthenticated submit requests (401).
- Validate incidentType in allowed enum.
- Validate lat/long bounds.
- Validate image size and MIME type.
- Apply rate limit for report endpoint.
- Never expose Cloudinary secret in client.

## 9. Realtime and Refresh Strategy

MVP approach:

- Pull-to-refresh is mandatory on mobile/web.
- Add lightweight polling (30-60s) on active News tab.

Optional phase 2:

- SSE/WebSocket push when admin verification changes status to VERIFIED.

## 10. Rollout Plan

- Phase 1: Backend endpoints + DB support + FE report flow + FE news list + pull-to-refresh.
- Phase 2: Polling optimization and admin moderation UX improvements.
- Phase 3: Push-based updates and trust/ranking enhancements.

## 11. Risks and Mitigations

- Spam reports: enforce auth, rate-limit, moderation gate.
- Poor geolocation accuracy: allow user correction before submit.
- Image upload failures: retry guidance + submit without image fallback.
- Mobile UX friction: keep steps <= 3 and large touch targets.

## 12. Acceptance Checklist

- News tab displays cards with icon + road + time + optional image.
- Report flow supports type selection, optional image, and submit success message.
- Only authenticated users can submit reports.
- News API returns only VERIFIED incidents in 5km radius, newest first.
- User can refresh feed and see newly verified items.

## 13. Open Questions

- Should unauthenticated users view News feed in MVP?
- Do we keep radius fixed at 5km or expose user setting (1/3/5km)?
- Which refresh policy is preferred for low-end devices?
