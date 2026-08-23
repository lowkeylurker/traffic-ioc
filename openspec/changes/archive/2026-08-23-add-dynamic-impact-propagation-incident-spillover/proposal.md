# Proposal: Dynamic Impact Propagation (Vet loang ket xe) cho su co giao thong

## Boi canh/Van de

Hien tai man hinh realtime chu yeu hien marker su co (tai nan, ngap, construction) tai mot diem. Cach hien thi nay chua giup lanh dao danh gia nhanh muc do nghiem trong cua su co tren toan luong giao thong xung quanh.

Trong nghiep vu thuc te TP.HCM, khi su co xay ra tai diem X, hang doi phia sau (upstream) thuong lan theo nhieu segment va tao "vet loang" ket xe. Du lieu van toc hien tai da co san trong he thong (`fact_traffic_flow`), vi vay co the tan dung de ve vung anh huong ma khong can DE tinh toan them pipeline moi.

## Muc tieu

- Bo sung kha nang "Dynamic Impact Propagation" tren ban do realtime.
- Khi operator click marker su co, he thong tra ve danh sach segment upstream bi anh huong trong ban kinh 2km.
- Frontend ve overlay do ruc bang Deck.gl PathLayer voi glow/pulse de tao hieu ung "vet dau loang".
- Cung cap summary nhanh de lanh dao danh gia muc do nghiem trong ma khong can doc bang so lieu chi tiet.

## Phi muc tieu

- Khong thay doi ETL/Data Engineering pipeline hoac tao fact table moi.
- Khong day du hoa mo hinh vat ly dong xe phuc tap (khong simulation vi mo trong phase nay).
- Khong thay doi luong moderation incident crowdsourcing.
- Khong dua vao websocket bat buoc trong phase MVP (uu tien API request-response don gian).

## In Scope

- Backend endpoint impact propagation theo incident ID.
- Query PostGIS + topology segment connectivity de tim upstream impacted segments.
- Dieu kien impacted: `currentSpeed < targetSpeed` hoac `tti > 1.5`.
- Frontend interaction click incident marker -> fetch impact -> render PathLayer.
- Legend severity, loading/empty/error state, va summary card.
- Unit/integration/UI test va metric observability can thiet.

## Out of Scope

- Tu dong de xuat phan luong toi uu.
- Luu vet lich su propagation theo thoi gian (time-series playback).
- He thong alert theo nguong propagation qua kenh ngoai (SMS/Email).

## Kien truc tong the FE-BE-DB

- FE (React + Mapbox + Deck.gl):
  - Bat su kien click marker su co.
  - Goi API impact propagation theo `incidentId`.
  - Render PathLayer overlay do theo `severityLevel` + pulse animation.
- BE (Node.js/Express + Prisma/$queryRaw):
  - Validate query params.
  - Lay incident geometry.
  - Truy vet upstream segments bang PostGIS + quan he ket noi segment.
  - Join voi speed hien tai va baseline/target de tinh TTI, loc impacted.
  - Tra ve danh sach segment + summary + metadata.
- DB (PostgreSQL/PostGIS):
  - Su dung du lieu hien co: `fact_incident`, `fact_traffic_flow`, `dim_segment`, bang ket noi topology/corridor neu co.
  - Khong them ETL moi; chi bo sung index/query optimization neu can.

## API Contract Draft

Endpoint de xuat:

- `GET /api/v1/incidents/:incidentId/impact-propagation`

Query params:

- `radiusMeters` (optional, default `2000`, hard max `5000`)
- `targetSpeedKmh` (optional, neu omit thi lay tu baseline/toc do muc tieu he thong)
- `ttiThreshold` (optional, default `1.5`, min `1.0`, max `5.0`)
- `maxDepth` (optional, gioi han do sau truy vet topology)
- `maxSegments` (optional, default `200`, hard max `500`)

Response shape (draft):

- `incident`: `incidentId`, `type`, `severity`, `timestamp`, `coordinates`
- `impactedSegments[]`:
  - `segmentId`
  - `geometry` (GeoJSON LineString)
  - `currentSpeed`
  - `targetSpeed`
  - `tti`
  - `distanceFromIncidentM`
  - `severityLevel` (`LOW|MEDIUM|HIGH|CRITICAL`)
- `summary`:
  - `totalImpactedSegments`
  - `impactedLengthKm`
  - `maxQueueDistanceKm`
  - `severityScore`

HTTP semantics:

- `200`: thanh cong
- `400`: query param khong hop le
- `404`: khong tim thay incident
- `422`: co incident nhung khong du du lieu topology/flow de tinh
- `500`: loi he thong

## UX/Interaction Details

- Operator click incident marker tren map.
- UI hien loading nho tai panel/legend.
- Neu thanh cong:
  - Ve PathLayer mau do tren impacted segments.
  - Do day line theo `severityLevel`.
  - Pulse animation de tao hieu ung "vet loang".
  - Hien summary severity ben canh map.
- Neu empty:
  - Hien thong diep "Chua ghi nhan vet loang dang ke trong ban kinh hien tai".
- Neu error:
  - Hien toast + fallback giu nguyen cac layer khac.
- Overlay impact can uu tien hien thi ro, nhung khong che hoan toan lop traffic hien co (opacity/control layer order).

## Hieu nang muc tieu

- p95 API impact propagation < 300ms voi du lieu thanh pho.
- Tu luc click marker den luc thay overlay < 1s.
- Gioi han payload de tranh lag FE (`maxSegments`, geometry simplify neu can).

## Rui ro va phu thuoc

- Rui ro topology khong day du hoac huong upstream khong ro rang cho mot so khu vuc.
- Sai lech target speed neu baseline data thieu theo khung gio.
- Query spatial recursive co the nang neu khong co guardrails/index.
- Phu thuoc vao chat luong geometry va speed update freshness.

## Rollout Plan theo Phase

1. Phase 1 (MVP API):

- Them endpoint impact propagation + param validation + guardrail.
- Truy vet upstream co ban trong radius 2km.

2. Phase 2 (MVP UI):

- Tich hop click incident -> render PathLayer glow/pulse.
- Them legend + summary + empty/error state.

3. Phase 3 (Optimization):

- Cache ngan han (30-60s) theo key request.
- Toi uu query/index va benchmark p95.
- Bo sung metric observability.

## Acceptance Criteria

1. Click marker su co se goi endpoint impact propagation va nhan du lieu hop le.
2. Backend tra ve danh sach upstream impacted segments trong ban kinh mac dinh 2km.
3. Segment duoc xac dinh impacted theo it nhat mot dieu kien: `currentSpeed < targetSpeed` hoac `tti > ttiThreshold`.
4. Frontend ve duoc PathLayer do + pulse, co phan cap theo severity.
5. UI co loading/empty/error state ro rang.
6. Endpoint dat p95 < 300ms trong bo benchmark MVP.

## Definition of Done

- Hoan tat artifacts OpenSpec: `change.yaml`, `proposal.md`, `design.md`, `tasks.md`, spec deltas.
- Co endpoint draft va requirement ro cho BE/FE.
- Co test plan unit + integration + UI test.
- `openspec validate <change-id> --strict --no-interactive` pass.

## Open Questions

1. Nguon topology ket noi upstream chinh thuc se dua tren bang nao (node graph, segment adjacency, hay bridge corridor fallback)?
2. `targetSpeed` uu tien baseline theo gio hay speed limit/nguong cau hinh?
3. Neu incident nam tren khu vuc mat topology, fallback uu tien theo huong duong/corridor hay chi spatial proximity?
4. Pulse animation can dong bo theo global clock hay local component timer?
5. Co can bat/tat layer "Vet loang" bang toggle rieng cho lanh dao/operator khong?
