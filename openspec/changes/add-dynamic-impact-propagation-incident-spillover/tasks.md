# Tasks: Dynamic Impact Propagation (Vet loang ket xe)

## Phase 1 - Specification & Contracts

1. [x] Chot API contract `GET /api/v1/incidents/:incidentId/impact-propagation` (query params, response shape, status code).
2. [x] Chot quy uoc tinh `tti`, `targetSpeed`, va severityLevel mapping.
3. [x] Chot guardrails (`radiusMeters`, `maxSegments`, timeout, cache TTL).

Dependencies:

- Can thong nhat voi owner A2/A1 ve nguon topology va baseline speed.

## Phase 2 - Backend API MVP

1. [x] Them route/controller cho impact propagation trong incident module.
2. [x] Implement service truy vet upstream segments bang PostGIS + topology connectivity trong radius.
3. [x] Join current speed/target speed, tinh TTI, loc impacted segments theo rule.
4. [x] Tinh summary (`totalImpactedSegments`, `impactedLengthKm`, `maxQueueDistanceKm`, `severityScore`).
5. [x] Them fallback spatial-only khi topology khong day du.
6. [x] Them cache ngan han va hard limit de tranh query qua tai.
7. [x] Bo sung logging + metric observability.

Dependencies:

- Phu thuoc vao bang geometry va speed hien co (`fact_incident`, `fact_traffic_flow`, `dim_segment`).

## Phase 3 - Frontend Visualization MVP

1. [x] Bat su kien click marker su co de goi impact propagation API.
2. [x] Render Deck.gl PathLayer overlay do theo impacted segments.
3. [x] Them glow/pulse animation theo severity.
4. [x] Them legend severity + summary panel.
5. [x] Hoan thien loading/empty/error state.
6. [x] Dieu chinh layer order/opacity de khong che mat lop traffic hien co.

Dependencies:

- Can API response geometry LineString hop le va severityLevel.

## Phase 4 - Testing & Validation

1. [ ] Unit tests cho backend service (validate, filter impacted, summary).
2. [ ] Integration tests endpoint voi fixture PostGIS.
3. [ ] UI tests cho click incident -> render overlay -> state transitions.
4. [ ] Benchmark KPI: p95 API < 300ms, overlay visible < 1s.
5. [x] Chay `openspec validate add-dynamic-impact-propagation-incident-spillover --strict --no-interactive`.

## Definition of Done

- [x] API impact propagation hoat dong voi guardrails va error handling day du.
- [x] UI hien thi vet loang ket xe truc quan (glow/pulse) va co legend/summaries.
- [ ] Bo test va benchmark dat tieu chi MVP.
- [x] OpenSpec validation strict pass.
