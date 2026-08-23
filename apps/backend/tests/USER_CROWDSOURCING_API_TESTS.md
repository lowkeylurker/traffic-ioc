# User Crowdsourcing API Tests (Manual)

## Prerequisites

- Backend running with Clerk + Cloudinary env vars.
- Migration `20260324113000_add_user_crowdsourcing_incidents` applied.
- One admin account and one regular user account.

## 1) Auth and validation tests

### 1.1 Reject unauthenticated submit

```bash
curl -X POST http://localhost:3000/api/v1/user/report \
  -F "incidentType=ACCIDENT" \
  -F "lat=10.7769" \
  -F "long=106.7009"
```

Expected: 401.

### 1.2 Reject invalid incident type

```bash
curl -X POST http://localhost:3000/api/v1/user/report \
  -H "Authorization: Bearer <user_token>" \
  -F "incidentType=INVALID" \
  -F "lat=10.7769" \
  -F "long=106.7009"
```

Expected: 400.

### 1.3 Reject invalid coordinates

```bash
curl -X POST http://localhost:3000/api/v1/user/report \
  -H "Authorization: Bearer <user_token>" \
  -F "incidentType=ACCIDENT" \
  -F "lat=999" \
  -F "long=106.7009"
```

Expected: 400.

## 2) Report integration tests

### 2.1 Submit report without image

```bash
curl -X POST http://localhost:3000/api/v1/user/report \
  -H "Authorization: Bearer <user_token>" \
  -F "incidentType=CONGESTION" \
  -F "lat=10.7769" \
  -F "long=106.7009"
```

Expected: 201 + status PENDING + acknowledgement message.

### 2.2 Submit report with image

```bash
curl -X POST http://localhost:3000/api/v1/user/report \
  -H "Authorization: Bearer <user_token>" \
  -F "incidentType=FLOOD" \
  -F "lat=10.7769" \
  -F "long=106.7009" \
  -F "image=@./sample.jpg"
```

Expected: 201 + persisted image URL.

## 3) Feed filtering tests

### 3.1 Feed returns VERIFIED only

```bash
curl "http://localhost:3000/api/v1/user/news?lat=10.7769&long=106.7009&radius=5"
```

Expected: no PENDING rows.

### 3.2 New VERIFIED incident appears first

- Verify any pending report via admin endpoint.
- Re-run feed query.
  Expected: newest VERIFIED incident appears near top by timestamp.

## 4) Moderation and ownership tests

### 4.1 User cannot update another user's report

```bash
curl -X PATCH http://localhost:3000/api/v1/user/report/<incident_id> \
  -H "Authorization: Bearer <different_user_token>" \
  -F "incidentType=ACCIDENT"
```

Expected: 400 with not editable/found message.

### 4.2 Only admin can moderate report status

```bash
curl -X PATCH http://localhost:3000/api/v1/user/report/<incident_id>/status \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"VERIFIED"}'
```

Expected: 403.

```bash
curl -X PATCH http://localhost:3000/api/v1/user/report/<incident_id>/status \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"VERIFIED"}'
```

Expected: 200.
