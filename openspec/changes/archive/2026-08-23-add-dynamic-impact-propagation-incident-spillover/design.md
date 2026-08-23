# Design: Dynamic Impact Propagation (Vet loang ket xe)

## 1. Tong quan giai phap

Tinh nang bo sung mot luong du lieu moi cho Incident Monitoring:

- Input: `incidentId` + tham so truy vet (`radiusMeters`, `ttiThreshold`, ...)
- Processing: truy vet upstream segments + loc impacted theo speed/TTI
- Output: tap segment de FE ve PathLayer glow/pulse

Muc tieu la hien thi truc quan nhanh, khong doi hoi de bo sung ETL hoac mo hinh simulation nang.

## 2. Kien truc luong du lieu

1. FE click marker incident.
2. FE goi `GET /api/v1/incidents/:incidentId/impact-propagation`.
3. BE validation query params + lookup incident geometry.
4. BE query PostGIS + topology de lay candidate upstream segments trong radius.
5. BE join current speed + target speed, tinh TTI va loc impacted.
6. BE tra response gom metadata, impactedSegments, summary.
7. FE render Deck.gl PathLayer + legend + summary.

## 3. Thiet ke Backend (Node.js + PostGIS)

### 3.1 Service decomposition

- `incidentImpactService.getImpactPropagation(params)`:
  - validate input
  - get incident point
  - build candidate set (topology-first)
  - evaluate impacted condition
  - compute summary
  - cache result ngan han

### 3.2 Upstream tracing strategy (MVP)

Uu tien giai phap don gian, de verify nhanh:

- Buoc A - Spatial gate:
  - Chi lay segment co geometry trong `ST_DWithin(incident_point, segment_geometry, radiusMeters)`.
- Buoc B - Connectivity gate:
  - Dua tren quan he ket noi segment adjacency (neu co graph/topology table).
  - Neu adjacency khong day du: fallback theo huong corridor + proximity.
- Buoc C - Impact filter:
  - `currentSpeed < targetSpeed` OR `tti > ttiThreshold`.

Ghi chu: `tti = targetSpeed / NULLIF(currentSpeed,0)` (hoac theo quy uoc he thong hien tai).

### 3.3 Fallback strategy

Neu topology khong du:

- Tra ve ket qua fallback spatial-only trong radius + filter speed/TTI.
- Gan `degradedMode: true` trong metadata (optional) de FE co the hien thong bao nhe.
- Khong fail toan bo request neu van con du lieu co y nghia.

### 3.4 Caching & guardrails

- Cache key: hash tu (`incidentId`, `radiusMeters`, `targetSpeedKmh`, `ttiThreshold`, `maxDepth`, `maxSegments`).
- TTL de xuat: 30-60 giay.
- Hard limits:
  - `radiusMeters <= 5000`
  - `maxSegments <= 500`
  - timeout query (vd 250ms-500ms tuy env)

### 3.5 Error handling

- 400: param invalid
- 404: incident khong ton tai
- 422: khong du du lieu de suy luan propagation
- 500: unexpected errors

Response luon theo format camelCase + message ro nghia.

## 4. Thiet ke Frontend (React + Deck.gl)

### 4.1 Interaction flow

- Click marker su co -> set selected incident -> trigger API call.
- Trong luc tai: hien loading indicator tai legend/panel.
- Co data:
  - render `PathLayer` impact overlay
  - update summary card
- Loi/empty:
  - thong bao ro trang thai
  - giu nguyen cac layer khac

### 4.2 Visual encoding

- Mau: do ruc theo severity gradient.
- Do day line:
  - severity cao hon -> line day hon.
- Glow/Pulse:
  - dung animation phase theo time-based uniform/state update.
- Layer ordering:
  - impact overlay tren lop traffic nhung giu opacity de khong che het data goc.

## 5. Data contract mapping

- `impactedSegments[].geometry` phai la LineString hop le cho Deck.gl PathLayer.
- `severityLevel` su dung enum ro rang de map style FE.
- `summary` duoc tinh san BE de FE khong phai tinh lai.

## 6. Testing strategy

- Unit test:
  - validate params
  - impacted predicate (`speed`/`tti`)
  - severity scoring
- Integration test:
  - endpoint voi mock/fixture PostGIS data
  - fallback khi topology khong du
  - response shape
- UI test:
  - click incident -> goi API
  - render PathLayer
  - loading/empty/error state

## 7. Observability

Metrics de xuat:

- `incident_impact_requests_total`
- `incident_impact_query_latency_ms` (p50/p95/p99)
- `incident_impact_segments_count`
- `incident_impact_degraded_mode_count`

Dashboard can theo doi:

- p95 latency theo khung gio
- phan bo so segment bi anh huong
- ty le request fallback/degraded

## 8. Trade-offs

- Topology-accurate tracing cho chat luong cao hon nhung phuc tap hon va nhay cam voi chat luong graph.
- Spatial-only fallback don gian va robust hon, nhung do chinh xac huong upstream thap hon.
- MVP chon hybrid: topology-first, fallback spatial-only de dam bao tinh kha dung.
