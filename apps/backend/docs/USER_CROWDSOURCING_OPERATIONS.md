# User Crowdsourcing Operations Notes

## Environment Variables

Set these variables in backend runtime environment:

- CLERK_PUBLISHABLE_KEY
- CLERK_SECRET_KEY
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- CLOUDINARY_INCIDENT_FOLDER (optional, default: traffic-ioc/incidents)

## Suggested Metrics and Alerts

Monitor these metrics for production stability:

- api_user_report_requests_total
- api_user_report_failures_total
- api_user_news_latency_ms_p95
- incident_pending_count
- incident_verified_count
- cloudinary_upload_failure_total

Alert suggestions:

- Upload failure ratio > 10% in 5 minutes.
- News endpoint p95 latency > 2000 ms.
- Pending queue growth exceeds moderation threshold.

## Rollback Notes

If migration or release must be rolled back:

1. Disable user report endpoint via route-level feature toggle or reverse proxy block.
2. Keep read-only user news endpoint enabled only if schema remains compatible.
3. Revert application deployment to previous version.
4. If schema rollback is required, remove dependent code first, then:
   - drop added indexes,
   - drop added columns (source/status/reporter_id/image_url/upvotes),
   - drop enum types incident_source and incident_status only when no dependent columns remain.
5. Re-run smoke checks on /health and incident APIs.

## Manual Verification Commands

- Apply migration and run: backend/prisma/migrations/20260324113000_add_user_crowdsourcing_incidents/verification.sql
- Validate sample insert:
  - POST /api/v1/user/report (with auth)
- Validate verified-only feed:
  - GET /api/v1/user/news?lat=10.7769&long=106.7009&radius=5
