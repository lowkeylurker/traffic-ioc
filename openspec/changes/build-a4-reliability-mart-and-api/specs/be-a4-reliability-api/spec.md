## ADDED Requirements

### Requirement: He thong MUST cung cap endpoint GET /api/v1/analytics/reliability

Backend MUST cung cap endpoint reliability doc tu `report_reliability` de phuc vu FE A4.

#### Scenario: Truy van reliability thanh cong

- **GIVEN** query params hop le (`timeWindow`, `sortBy`, `limit`)
- **WHEN** client goi API
- **THEN** he thong tra HTTP 200
- **AND** response data duoc map camelCase

### Requirement: API MUST validate query params va sorting behavior

API MUST validate enum va gioi han limit de dam bao hanh vi truy van on dinh.

#### Scenario: Query params hop le

- **GIVEN** `timeWindow` thuoc `AM_PEAK|PM_PEAK|OFF_PEAK`
- **AND** `sortBy` thuoc `buffer_index|pti`
- **WHEN** API duoc goi
- **THEN** he thong sort dung truong yeu cau
- **AND** tra so ban ghi theo `limit`

#### Scenario: Query params khong hop le

- **GIVEN** query param sai enum hoac limit khong hop le
- **WHEN** API duoc goi
- **THEN** he thong tra HTTP 400 voi thong diep validation ro rang

### Requirement: API reliability MUST dat muc tieu hieu nang tren mart precompute

API MUST huong toi p95 response time nho hon 100ms tren du lieu mart da precompute va index day du.

#### Scenario: Benchmark API reliability

- **GIVEN** report_reliability co du lieu ky gan nhat
- **WHEN** chay benchmark endpoint reliability
- **THEN** p95 response time dat muc tieu < 100ms
