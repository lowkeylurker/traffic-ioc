## ADDED Requirements

### Requirement: He thong MUST cung cap endpoint impact propagation theo incident

He thong MUST cung cap endpoint `GET /api/v1/incidents/:incidentId/impact-propagation` de tra ve cac segment upstream bi anh huong quanh su co.

#### Scenario: Truy van propagation thanh cong voi tham so mac dinh

- GIVEN mot `incidentId` hop le
- AND request khong truyen `radiusMeters` va `ttiThreshold`
- WHEN client goi endpoint impact propagation
- THEN he thong SHALL su dung `radiusMeters=2000` va `ttiThreshold=1.5`
- AND tra ve HTTP 200
- AND response gom `incident`, `impactedSegments`, `summary`

#### Scenario: Incident khong ton tai

- GIVEN `incidentId` khong ton tai
- WHEN client goi endpoint impact propagation
- THEN he thong SHALL tra HTTP 404 voi thong diep ro rang

### Requirement: He thong MUST xac dinh impacted segments theo speed/TTI va topology

He thong MUST truy vet segment ket noi upstream trong ban kinh yeu cau va loc impacted theo quy tac nghiep vu.

#### Scenario: Segment duoc danh dau impacted theo speed

- GIVEN candidate upstream segment co `currentSpeed < targetSpeed`
- WHEN he thong danh gia propagation
- THEN segment do SHALL duoc dua vao `impactedSegments`

#### Scenario: Segment duoc danh dau impacted theo TTI

- GIVEN candidate upstream segment co `tti > ttiThreshold`
- WHEN he thong danh gia propagation
- THEN segment do SHALL duoc dua vao `impactedSegments`

#### Scenario: Segment khong dat nguong impact

- GIVEN candidate segment co `currentSpeed >= targetSpeed`
- AND `tti <= ttiThreshold`
- WHEN he thong danh gia propagation
- THEN segment do SHALL KHONG duoc dua vao `impactedSegments`

### Requirement: He thong MUST co fallback va guardrails de dam bao on dinh

He thong MUST co fallback khi topology khong day du va gioi han tai nguyen de tranh qua tai.

#### Scenario: Topology khong day du

- GIVEN incident hop le nhung du lieu connectivity khong du
- WHEN endpoint impact propagation duoc goi
- THEN he thong SHALL fallback sang chien luoc spatial-only trong ban kinh
- AND van ap dung impacted filter theo speed/TTI

#### Scenario: Vuot qua hard limit

- GIVEN request co `maxSegments` vuot nguong he thong
- WHEN endpoint impact propagation duoc goi
- THEN he thong SHALL clamp ve hard limit cho phep
- AND response khong vuot qua gioi han segment toi da

### Requirement: Response impact propagation MUST bao gom du lieu phuc vu visualization va giam sat

Response MUST du field de FE render PathLayer va theo doi muc do nghiem trong.

#### Scenario: Response shape day du

- GIVEN request thanh cong
- WHEN he thong tra ket qua propagation
- THEN moi item trong `impactedSegments` SHALL gom `segmentId`, `geometry`, `currentSpeed`, `targetSpeed`, `tti`, `distanceFromIncidentM`, `severityLevel`
- AND `summary` SHALL gom `totalImpactedSegments`, `impactedLengthKm`, `maxQueueDistanceKm`, `severityScore`

#### Scenario: Observability metrics

- GIVEN endpoint duoc goi trong moi truong van hanh
- WHEN request ket thuc
- THEN he thong SHALL ghi nhan metric it nhat gom request count, query latency, va impacted segments count
